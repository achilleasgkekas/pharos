import { connectDB } from '@/lib/db';
import { Subscription } from '@/models/Subscription';
import { Statement } from '@/models/Statement';
import { Item } from '@/models/Item';
import { Voucher } from '@/models/Voucher';
import { Expense } from '@/models/Expense';
import { computeInstallmentPlans } from '@/lib/installments';
import type { SerializedStatement } from '@/types';
import { CalendarClient, type Entry, type MonthBlock } from './CalendarClient';
import { getServerT } from '@/lib/i18n/server';
import type { TFunc, TKey } from '@/lib/i18n';

// Money calendar — everything money-related coming up in the next 3 months:
// subscription renewals, card installments, recurring bills/income, and warranty
// / voucher expiries. Derived live here, rendered (Month / Agenda / List) client-side.

export const dynamic = 'force-dynamic';

function addCycle(d: Date, cycle: string): Date {
  const n = new Date(d);
  if (cycle === 'weekly') n.setDate(n.getDate() + 7);
  else if (cycle === 'quarterly') n.setMonth(n.getMonth() + 3);
  else if (cycle === 'yearly') n.setFullYear(n.getFullYear() + 1);
  else n.setMonth(n.getMonth() + 1); // monthly default
  return n;
}
const mk = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

async function getAgenda(t: TFunc, intlTag: string): Promise<{ months: MonthBlock[]; dueThisMonth: number }> {
  await connectDB();
  const now = new Date();
  const windowStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const windowEnd = new Date(now.getFullYear(), now.getMonth() + 3, 1);

  const [subs, statements, items, vouchers, recurring] = await Promise.all([
    Subscription.find({ active: true, nextRenewal: { $ne: null } }).select('name amount billingCycle nextRenewal').lean(),
    Statement.find().lean(),
    Item.find({ warrantyUntil: { $gte: windowStart, $lt: windowEnd } }).select('title warrantyUntil').lean(),
    Voucher.find({ used: false, expiresAt: { $gte: windowStart, $lt: windowEnd } }).select('title store discount expiresAt').lean(),
    Expense.find({ recurring: true, recurringCycle: { $nin: ['', null] }, amount: { $gt: 0 } })
      .sort({ date: -1 })
      .select('kind vendor vendorKey amount date recurringCycle')
      .lean(),
  ]);

  const months: MonthBlock[] = [0, 1, 2].map((i) => {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    return {
      key: mk(d),
      label: d.toLocaleDateString(intlTag, { month: 'long', year: 'numeric' }),
      entries: [],
      out: 0,
      inc: 0,
    };
  });
  const byKey = new Map(months.map((m) => [m.key, m]));
  const push = (date: Date, e: Omit<Entry, 'date'>) => {
    const m = byKey.get(mk(date));
    if (!m) return;
    m.entries.push({ ...e, date: date.toISOString() });
    if (e.amount != null) {
      if (e.kind === 'income') m.inc += e.amount;
      else m.out += e.amount;
    }
  };

  // Subscription renewals — step each one forward through the window (a monthly
  // sub shows up in all 3 months, a yearly only if it lands inside).
  for (const s of subs) {
    let d = new Date(s.nextRenewal as unknown as string);
    let guard = 0;
    while (d < windowEnd && guard < 8) {
      guard++;
      if (d >= windowStart) {
        push(d, { kind: 'renewal', label: s.name || t('cal.lblSubscription'), sub: t('cal.subRenews', { cycle: t(`sub.${s.billingCycle || 'monthly'}` as TKey) }), amount: s.amount || 0 });
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
      push(d, { pinned: true, kind: 'installments', label: t('cal.lblInstallments'), sub: due.length === 1 ? t('cal.subPlan') : t('cal.subPlans', { n: due.length }), amount });
    }
  }

  // Recurring bills / income — project the next occurrences from each series'
  // latest entry (future only: past ones are auto-posted by generateDueRecurring).
  const seen = new Set<string>();
  for (const r of recurring) {
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
          label: r.vendor || t(r.kind === 'income' ? 'cal.lblIncome' : 'cal.lblBill'),
          sub: t('cal.subExpected', { cycle: t(`sub.${r.recurringCycle}` as TKey) }),
          amount: r.amount || 0,
        });
      }
      d = addCycle(d, String(r.recurringCycle));
    }
  }

  // Expiries (no amount — just don't miss them).
  for (const i of items) {
    push(new Date(i.warrantyUntil as unknown as string), { kind: 'warranty', label: i.title || t('cal.lblItem'), sub: t('cal.subWarranty'), amount: null });
  }
  for (const v of vouchers) {
    push(new Date(v.expiresAt as unknown as string), { kind: 'voucher', label: v.title || t('cal.lblVoucher'), sub: t('cal.subVoucher', { store: v.store || '', discount: v.discount || '' }).trim(), amount: null });
  }

  for (const m of months) {
    m.entries.sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || new Date(a.date).getTime() - new Date(b.date).getTime());
    m.out = Math.round(m.out * 100) / 100;
    m.inc = Math.round(m.inc * 100) / 100;
  }
  return { months, dueThisMonth: months[0].out };
}

export default async function CalendarPage() {
  const { t, locale } = await getServerT();
  const intlTag = ({ en: 'en-GB', el: 'el', es: 'es', fr: 'fr', de: 'de', it: 'it', pt: 'pt', nl: 'nl' } as Record<string, string>)[locale] ?? 'en-GB';
  const { months, dueThisMonth } = await getAgenda(t, intlTag);
  return <CalendarClient months={months} dueThisMonth={dueThisMonth} />;
}
