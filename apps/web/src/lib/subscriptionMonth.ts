// What the subscriptions actually charge in one calendar month, as opposed to their
// "monthly equivalent" (a yearly plan spread over twelve months). A €120 yearly plan due in
// February adds €120 to February and nothing to the other months.
import { addCycle, cycleRenews } from './billingCycle';
import { renewalOnOrAfter } from './subscriptionRenewal';

type SubLike = { amount: number; billingCycle: string; nextRenewal: string | null; startDate?: string | null; active: boolean };

/** Total charged in [first day of the month, first day of the next), month 0-based, UTC. */
export function chargedInMonth(subs: SubLike[], year: number, month: number): number {
  const from = new Date(Date.UTC(year, month, 1));
  const to = new Date(Date.UTC(year, month + 1, 1));
  let total = 0;
  for (const s of subs) {
    if (!s.active || !s.nextRenewal) continue;
    const amount = Number(s.amount) || 0;
    const cycle = s.billingCycle || 'monthly';
    let d = renewalOnOrAfter(s.nextRenewal, cycle, from, s.startDate ?? null);
    if (!d) continue;
    if (!cycleRenews(cycle)) {
      if (d >= from && d < to) total += amount;
      continue;
    }
    const anchor = d;
    for (let guard = 0; d < to && guard < 40; guard++) {
      if (d >= from) total += amount;
      d = addCycle(d, cycle, anchor);
    }
  }
  return Math.round(total * 100) / 100;
}

/** The next `n` months from `now` (this month first), each with what is charged in it. */
export function chargesByMonth(subs: SubLike[], now: Date, n = 12): { year: number; month: number; total: number }[] {
  const out: { year: number; month: number; total: number }[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1));
    out.push({ year: d.getUTCFullYear(), month: d.getUTCMonth(), total: chargedInMonth(subs, d.getUTCFullYear(), d.getUTCMonth()) });
  }
  return out;
}
