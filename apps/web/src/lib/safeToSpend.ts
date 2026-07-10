import type { AgendaMonth } from '@/lib/moneyAgenda';

// "Safe-to-spend" forward cashflow (P19). The money agenda (lib/moneyAgenda.ts)
// already projects every dated future money event across the current + next two
// months — subscription renewals, card installments, recurring bills/income. This
// distils that stream into one actionable number: known expected income minus known
// fixed future charges over a forward window, so the answer to "what can I safely
// spend?" is a figure, not a calendar. Deterministic, DB-free (the caller supplies
// the agenda), zero AI. `now` is injectable for tests.
//
// Phase 1 subtracts only fixed known charges that the agenda emits with an amount
// (renewals, installments, recurring bills) and counts recurring income; a starting
// bank balance and variable-spend median are deliberately out of scope (phase 2).
// The agenda window is ~3 months, so the 90-day tail can slightly undercount events
// past the window edge — acceptable for a "known fixed charges" figure.

export type CashflowWindow = {
  days: number; // 30 / 60 / 90
  income: number;
  outflow: number;
  net: number; // income - outflow (positive = surplus you can spend)
};

export type SafeToSpend = {
  monthLabel: string; // e.g. "July 2026" — the current month
  thisMonth: { income: number; outflow: number; net: number };
  windows: CashflowWindow[];
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Aggregate the money agenda into forward cashflow windows. Only entries dated
 *  today-or-later with a known amount count; income adds, everything else subtracts. */
export function computeSafeToSpend(months: AgendaMonth[], now: Date = new Date()): SafeToSpend {
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  const entries = months
    .flatMap((m) => m.entries)
    .filter((e) => e.amount != null)
    .map((e) => ({ when: new Date(e.date), amount: e.amount as number, income: e.kind === 'income' }))
    .filter((e) => !isNaN(e.when.getTime()) && e.when >= startToday);

  const sum = (cutoff: Date, inclusive: boolean) => {
    let income = 0;
    let outflow = 0;
    for (const e of entries) {
      if (inclusive ? e.when > cutoff : e.when >= cutoff) continue;
      if (e.income) income += e.amount;
      else outflow += e.amount;
    }
    return { income: round2(income), outflow: round2(outflow), net: round2(income - outflow) };
  };

  const windows: CashflowWindow[] = [30, 60, 90].map((days) => {
    const cutoff = new Date(startToday);
    cutoff.setDate(cutoff.getDate() + days);
    return { days, ...sum(cutoff, false) };
  });

  return {
    monthLabel: now.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }),
    thisMonth: sum(endMonth, true),
    windows,
  };
}
