import { connectDB } from '@/lib/db';
import { addCycle, cycleRenews } from '@/lib/billingCycle';
import { renewalOnOrAfter } from '@/lib/subscriptionRenewal';
import { currentModel } from '@/lib/tenancy/connection';
import { Subscription as SubscriptionModel } from '@/models/Subscription';
import { Voucher as VoucherModel } from '@/models/Voucher';
import { Item as ItemModel } from '@/models/Item';
import { Statement as StatementModel } from '@/models/Statement';
import { Expense as ExpenseModel } from '@/models/Expense';
import { Bill as BillModel } from '@/models/Bill';
import { Goal as GoalModel } from '@/models/Goal';
import { billRemaining } from '@/lib/bill';
import { computeInstallmentPlans } from '@/lib/installments';
import type { SerializedStatement } from '@/types';

// Shared 3-month "money agenda" computation: subscription renewals (stepped per
// cycle), card installments aggregated per month, recurring bills/income projected,
// open bills (P28) and goal deadlines (P12), warranty + voucher expiries, plus
// per-month in/out totals. Used by the /api/v1
// calendar route and the iCal (.ics) subscription feed. English labels —
// the web /calendar page keeps its own i18n copy since it renders per-locale.

// 'bill' is a PROJECTED recurring expense; 'payable' is a tracked Bill (P28) with a real
// due date you settle by hand. Two different things, so two kinds — merging them would
// make a projection indistinguishable from an actual obligation.
export type AgendaKind = 'renewal' | 'installments' | 'bill' | 'payable' | 'income' | 'goal' | 'warranty' | 'voucher';
export type AgendaEntry = { date: string; kind: AgendaKind; label: string; sub: string; amount: number | null; pinned?: boolean };
export type AgendaMonth = { key: string; label: string; entries: AgendaEntry[]; out: number; inc: number };

// A weekly subscription lands ~13 times across the 3-month window; the ceiling only has to
// bound the loop, so it sits just above that rather than truncating the cheapest cycle.
const MAX_RENEWALS_PER_WINDOW = 16;

const mk = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
// English fallback wording for the non-i18n agenda strings (the /calendar page renders
// its own translated copy). Keep in step with the cycles in lib/billingCycle.ts.
const cycleWord = (c: string) =>
  ({ weekly: 'weekly', monthly: 'monthly', quarterly: 'quarterly', yearly: 'yearly', biennial: 'every 2 years', lifetime: 'once' } as Record<string, string>)[c] || c || 'monthly';

/** Compute the current-month + next-2-month money agenda. `now` is injectable for
 *  deterministic tests; defaults to the real clock. Reads the DB (connectDB first). */
export async function computeMoneyAgenda(now: Date = new Date()): Promise<{ months: AgendaMonth[]; dueThisMonth: number }> {
  await connectDB();
  const windowStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const windowEnd = new Date(now.getFullYear(), now.getMonth() + 3, 1);

  // Tenant scoping: this helper is called from FOUR entrypoints (/reports page, /api/v1/reports,
  // /api/v1/calendar, /api/calendar.ics) and three of them have already established a tenant
  // context before getting here. Resolving the five models with `currentModel` is what makes the
  // reads follow that context; the direct imports it replaces always hit the DEFAULT database, so
  // a SaaS workspace was shown the default tenant's subscriptions, statements, warranties,
  // vouchers and recurring expenses — amounts and vendor names included.
  //
  // No `withRequestTenant` wrap on purpose. `currentModel` reads the ambient context and falls
  // back to DEFAULT_TENANT without ever throwing, so the one caller that has NO context (the
  // token-authenticated .ics feed) keeps behaving exactly as before instead of being sent through
  // the cookie gate. Self-hosted: no context anywhere, every `currentModel(X)` is `X`.
  const [Subscription, Statement, Item, Voucher, Expense, Bill, Goal] = await Promise.all([
    currentModel(SubscriptionModel),
    currentModel(StatementModel),
    currentModel(ItemModel),
    currentModel(VoucherModel),
    currentModel(ExpenseModel),
    currentModel(BillModel),
    currentModel(GoalModel),
  ]);

  const [subs, statements, items, vouchers, recurring, bills, goals] = await Promise.all([
    Subscription.find({ active: true, nextRenewal: { $ne: null }, deletedAt: null }).select('name amount billingCycle nextRenewal').lean(),
    Statement.find().lean(),
    Item.find({ warrantyUntil: { $gte: windowStart, $lt: windowEnd }, deletedAt: null }).select('title warrantyUntil').lean(),
    Voucher.find({ used: false, expiresAt: { $gte: windowStart, $lt: windowEnd }, deletedAt: null }).select('title store discount expiresAt').lean(),
    Expense.find({ recurring: true, recurringCycle: { $nin: ['', null] }, amount: { $gt: 0 }, deletedAt: null })
      .sort({ date: -1 })
      .select('kind vendor vendorKey amount date recurringCycle')
      .lean(),
    // P67 — open payables (P28) and goal deadlines (P12), the two money dates the
    // agenda used to miss entirely. Both window-bounded like the expiries below.
    Bill.find({ paidAt: null, archived: { $ne: true }, dueDate: { $gte: windowStart, $lt: windowEnd }, deletedAt: null })
      .select('title vendor amount payments dueDate')
      .lean(),
    Goal.find({ archived: { $ne: true }, targetDate: { $gte: windowStart, $lt: windowEnd }, deletedAt: null })
      .select('title targetAmount contributions targetDate')
      .lean(),
  ]);

  const months: AgendaMonth[] = [0, 1, 2].map((i) => {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    return {
      key: mk(d),
      label: d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }),
      entries: [],
      out: 0,
      inc: 0,
    };
  });
  const byKey = new Map(months.map((m) => [m.key, m]));
  const push = (date: Date, e: Omit<AgendaEntry, 'date'>) => {
    const m = byKey.get(mk(date));
    if (!m) return;
    m.entries.push({ ...e, date: date.toISOString() });
    if (e.amount != null) {
      if (e.kind === 'income') m.inc += e.amount;
      else m.out += e.amount;
    }
  };

  // Subscription renewals — step each one forward through the window.
  for (const s of subs as { name?: string; amount?: number; billingCycle?: string; nextRenewal?: Date }[]) {
    // A non-renewing cycle (lifetime) must not be stepped: addCycle returns the same
    // date, which would push the identical entry once per guard iteration.
    if (!cycleRenews(s.billingCycle || 'monthly')) continue;
    // Seed at the window instead of stepping to it: `nextRenewal` is a snapshot nothing
    // advances, so a subscription last saved years ago used to burn the whole step budget
    // catching up and never reach the window at all — the charge simply vanished from the
    // agenda, and from the safe-to-spend figure built on it.
    let d = renewalOnOrAfter(s.nextRenewal, s.billingCycle, windowStart);
    if (!d) continue;
    let guard = 0;
    while (d < windowEnd && guard < MAX_RENEWALS_PER_WINDOW) {
      guard++;
      if (d >= windowStart) {
        push(d, { kind: 'renewal', label: s.name || 'Subscription', sub: `Renews ${cycleWord(s.billingCycle || 'monthly')}`, amount: s.amount || 0 });
      }
      d = addCycle(d, s.billingCycle || 'monthly');
    }
  }

  // Card installments — one aggregated line per month (charged with the statement).
  const plans = computeInstallmentPlans(JSON.parse(JSON.stringify(statements)) as SerializedStatement[]).filter((p) => !p.done);
  for (let i = 0; i < 3; i++) {
    const due = plans.filter((p) => p.remainingInstallments >= i + 1);
    const amount = due.reduce((t, p) => t + p.perAmount, 0);
    if (amount > 0) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      push(d, { pinned: true, kind: 'installments', label: 'Installments', sub: due.length === 1 ? '1 active plan' : `${due.length} active plans`, amount });
    }
  }

  // Recurring bills / income — project the next occurrences from each series' latest entry.
  const seen = new Set<string>();
  for (const r of recurring as { kind?: string; vendor?: string; vendorKey?: string; amount?: number; date?: Date; recurringCycle?: string }[]) {
    const key = `${r.kind}|${r.vendorKey}`;
    if (!r.vendorKey || seen.has(key)) continue;
    seen.add(key);
    let d = addCycle(new Date(r.date as unknown as string), String(r.recurringCycle));
    let guard = 0;
    while (d < windowEnd && guard < 8) {
      guard++;
      if (d > now) {
        push(d, {
          kind: r.kind === 'income' ? 'income' : 'bill',
          label: r.vendor || (r.kind === 'income' ? 'Income' : 'Bill'),
          sub: `Expected ${cycleWord(String(r.recurringCycle))}`,
          amount: r.amount || 0,
        });
      }
      d = addCycle(d, String(r.recurringCycle));
    }
  }

  // Open bills (P28) — what is still OWED, so a part-paid bill counts only the balance.
  for (const b of bills as { title?: string; vendor?: string; amount?: number; payments?: { amount?: number }[]; dueDate?: Date }[]) {
    const remaining = billRemaining(b.amount, b.payments, null);
    push(new Date(b.dueDate as unknown as string), {
      kind: 'payable',
      label: b.title || b.vendor || 'Bill',
      sub: 'Bill due',
      amount: remaining,
    });
  }

  // Goal deadlines (P12) — a date to notice, not a charge: no amount, so the month
  // totals and the safe-to-spend figure built on them stay untouched. A goal already
  // covered by its contributions has nothing left to warn about.
  for (const g of goals as { title?: string; targetAmount?: number; contributions?: { amount?: number }[]; targetDate?: Date }[]) {
    const target = Number(g.targetAmount) || 0;
    const saved = (g.contributions || []).reduce((t, c) => t + (Number(c?.amount) || 0), 0);
    if (target > 0 && saved >= target) continue;
    push(new Date(g.targetDate as unknown as string), {
      kind: 'goal',
      label: g.title || 'Goal',
      sub: 'Goal target date',
      amount: null,
    });
  }

  // Expiries (no amount — just don't miss them).
  for (const i of items as { title?: string; warrantyUntil?: Date }[]) {
    push(new Date(i.warrantyUntil as unknown as string), { kind: 'warranty', label: i.title || 'Item', sub: 'Warranty expires', amount: null });
  }
  for (const v of vouchers as { title?: string; store?: string; discount?: string; expiresAt?: Date }[]) {
    push(new Date(v.expiresAt as unknown as string), { kind: 'voucher', label: v.title || 'Voucher', sub: `${v.store || ''} ${v.discount || ''}`.trim(), amount: null });
  }

  for (const m of months) {
    m.entries.sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || new Date(a.date).getTime() - new Date(b.date).getTime());
    m.out = Math.round(m.out * 100) / 100;
    m.inc = Math.round(m.inc * 100) / 100;
  }
  return { months, dueThisMonth: months[0].out };
}
