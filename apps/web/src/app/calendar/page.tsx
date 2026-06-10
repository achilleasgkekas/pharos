import { connectDB } from '@/lib/db';
import { Subscription } from '@/models/Subscription';
import { Statement } from '@/models/Statement';
import { Item } from '@/models/Item';
import { Voucher } from '@/models/Voucher';
import { Expense } from '@/models/Expense';
import { computeInstallmentPlans } from '@/lib/installments';
import { cur } from '@/lib/money';
import type { SerializedStatement } from '@/types';
import { CalendarClock, Layers, ShieldCheck, Ticket, Wallet, Banknote } from 'lucide-react';

// Money calendar — ONE agenda of everything money-related coming up in the next
// 3 months: subscription renewals, card installments, recurring bills/income,
// and warranty / voucher expiries. All derived live, nothing stored.

export const dynamic = 'force-dynamic';

const mono = { fontFamily: 'var(--font-mono)' } as const;
const display = { fontFamily: 'var(--font-display)' } as const;

type Kind = 'renewal' | 'installments' | 'bill' | 'income' | 'warranty' | 'voucher';
type Entry = { date: string; pinned?: boolean; kind: Kind; label: string; sub: string; amount: number | null };
type MonthBlock = { key: string; label: string; entries: Entry[]; out: number; inc: number };

function addCycle(d: Date, cycle: string): Date {
  const n = new Date(d);
  if (cycle === 'weekly') n.setDate(n.getDate() + 7);
  else if (cycle === 'quarterly') n.setMonth(n.getMonth() + 3);
  else if (cycle === 'yearly') n.setFullYear(n.getFullYear() + 1);
  else n.setMonth(n.getMonth() + 1); // monthly default
  return n;
}
const mk = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

async function getAgenda(): Promise<{ months: MonthBlock[]; dueThisMonth: number }> {
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
      label: d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }),
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
        push(d, { kind: 'renewal', label: s.name || 'Subscription', sub: `renews · ${s.billingCycle}`, amount: s.amount || 0 });
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
      push(d, { pinned: true, kind: 'installments', label: 'Card installments', sub: `${due.length} active plan${due.length === 1 ? '' : 's'}`, amount });
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
          label: r.vendor || (r.kind === 'income' ? 'Income' : 'Bill'),
          sub: `expected · ${r.recurringCycle}`,
          amount: r.amount || 0,
        });
      }
      d = addCycle(d, String(r.recurringCycle));
    }
  }

  // Expiries (no amount — just don't miss them).
  for (const i of items) {
    push(new Date(i.warrantyUntil as unknown as string), { kind: 'warranty', label: i.title || 'Item', sub: 'warranty expires', amount: null });
  }
  for (const v of vouchers) {
    push(new Date(v.expiresAt as unknown as string), { kind: 'voucher', label: v.title || 'Voucher', sub: `${v.store || ''} ${v.discount || ''} · expires`.trim(), amount: null });
  }

  for (const m of months) {
    m.entries.sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || new Date(a.date).getTime() - new Date(b.date).getTime());
    m.out = Math.round(m.out * 100) / 100;
    m.inc = Math.round(m.inc * 100) / 100;
  }
  return { months, dueThisMonth: months[0].out };
}

const KIND_META: Record<Kind, { icon: React.ReactNode; color: string }> = {
  renewal: { icon: <CalendarClock size={15} />, color: 'var(--color-purple)' },
  installments: { icon: <Layers size={15} />, color: 'var(--color-gold)' },
  bill: { icon: <Wallet size={15} />, color: 'var(--color-red)' },
  income: { icon: <Banknote size={15} />, color: 'var(--color-accent)' },
  warranty: { icon: <ShieldCheck size={15} />, color: 'var(--color-cyan)' },
  voucher: { icon: <Ticket size={15} />, color: 'var(--color-gold)' },
};

export default async function CalendarPage() {
  const { months, dueThisMonth } = await getAgenda();
  const empty = months.every((m) => m.entries.length === 0);

  return (
    <main className="max-w-[900px] mx-auto px-4 py-6 pb-16">
      <div className="mb-6 flex items-end justify-between gap-4 flex-wrap">
        <h1 className="text-2xl md:text-3xl font-bold" style={display}>
          Calendar
          <span className="ml-3 text-sm font-normal text-[color:var(--color-text-faint)]" style={mono}>next 3 months</span>
        </h1>
        <span className="text-xs text-[color:var(--color-text-dim)]" style={mono}>
          due this month <span className="text-[color:var(--color-gold)] font-bold">{cur()}{dueThisMonth.toLocaleString('en-GB')}</span>
        </span>
      </div>

      {empty ? (
        <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-8 text-center text-sm text-[color:var(--color-text-dim)]">
          Nothing scheduled — renewals, installments, recurring bills and expiries will show up here.
        </div>
      ) : (
        months.map((m) => (
          <section key={m.key} className="mb-6">
            <div className="flex items-baseline justify-between mb-2 pb-1.5 border-b border-[color:var(--color-border)]">
              <h2 className="text-sm font-bold uppercase tracking-[0.1em]" style={mono}>{m.label}</h2>
              <span className="text-[11px] text-[color:var(--color-text-faint)]" style={mono}>
                {m.out > 0 && <>out <span className="text-[color:var(--color-red)]">{cur()}{m.out.toLocaleString('en-GB')}</span></>}
                {m.inc > 0 && <> · in <span className="text-[color:var(--color-accent)]">{cur()}{m.inc.toLocaleString('en-GB')}</span></>}
              </span>
            </div>
            {m.entries.length === 0 ? (
              <p className="text-xs text-[color:var(--color-text-faint)] italic py-2">Nothing scheduled.</p>
            ) : (
              <div className="space-y-1.5">
                {m.entries.map((e, i) => {
                  const meta = KIND_META[e.kind];
                  const d = new Date(e.date);
                  return (
                    <div key={i} className="flex items-center gap-3 bg-[color:var(--color-surface)] border border-[color:var(--color-border)] rounded-xl px-3.5 py-2.5">
                      <span className="grid place-items-center w-8 h-8 rounded-lg shrink-0" style={{ color: meta.color, background: `color-mix(in srgb, ${meta.color} 12%, transparent)` }}>
                        {meta.icon}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{e.label}</p>
                        <p className="text-[10px] text-[color:var(--color-text-faint)]" style={mono}>{e.sub}</p>
                      </div>
                      <span className="text-[11px] text-[color:var(--color-text-faint)] shrink-0 w-14 text-right" style={mono}>
                        {e.pinned ? 'monthly' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                      </span>
                      {e.amount != null && (
                        <span className={`text-sm font-bold shrink-0 w-20 text-right ${e.kind === 'income' ? 'text-[color:var(--color-accent)]' : ''}`} style={display}>
                          {e.kind === 'income' ? '+' : ''}{cur()}{e.amount.toLocaleString('en-GB')}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        ))
      )}
    </main>
  );
}
