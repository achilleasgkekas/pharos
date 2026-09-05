import { addCycle, cycleRenews } from '@/lib/billingCycle';

// `Subscription.nextRenewal` is a SNAPSHOT, not a live date: it is written once by
// createSubscription/updateSubscription (rolling `startDate` forward to the next future
// occurrence) and then never touched again. Nothing advances it when the date actually
// arrives, so the day after a renewal passes the card reads "Renews overdue" and keeps
// reading that forever — the only cure was to open the subscription and re-save it, which
// recomputed the snapshot from `startDate`. Nothing was wrong with the subscription; the
// stored date had simply gone stale.
//
// The same stale date quietly corrupted the money side too: /calendar and lib/moneyAgenda
// step from `nextRenewal` into their 3-month window with a bounded loop, so a subscription
// left behind for long enough ran the loop out before it ever reached the window and
// vanished from the agenda (and therefore from safe-to-spend) altogether.
//
// So the renewal date any surface should show is DERIVED, the way lib/bill.ts derives a
// bill's status rather than storing a flag that drifts: take the stored date and, when it
// has gone by, roll it forward whole cycles. An active subscription on a monthly cycle
// charged you again — assuming it did is exactly what the manual re-save assumed, minus
// the manual part. Nothing here writes; every reader derives the same answer from the
// same stored row, so there is no second copy of the truth to fall out of sync.

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// The roll-forward loops are bounded for the same reason nextOccurrence's are: a
// pathological stored date (year 1900 on a weekly cycle, ~6500 steps) must terminate.
const MAX_STEPS = 10000;

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Whole days until a renewal date; negative once it has passed, null when there is no
 * date. This is the countdown the subscription card renders ("renews in 3 days"), kept
 * here so the badge and the roll-forward below agree on the day a renewal stops being
 * "today" — a date at UTC midnight is still today for a reader west of Greenwich.
 */
export function renewalDaysUntil(date: string | Date | null | undefined, now: number = Date.now()): number | null {
  const d = toDate(date);
  if (!d) return null;
  return Math.ceil((d.getTime() - now) / MS_PER_DAY);
}

/** Has this renewal gone by? True exactly when the card would have said "overdue". */
export function renewalHasPassed(date: string | Date | null | undefined, now: number = Date.now()): boolean {
  const days = renewalDaysUntil(date, now);
  return days !== null && days < 0;
}

/** Step `start` forward one cycle at a time for as long as `behind` says it is too early. */
function roll(start: Date, cycle: string, behind: (d: Date) => boolean): Date {
  let d = start;
  let guard = 0;
  while (behind(d) && guard < MAX_STEPS) {
    d = addCycle(d, cycle);
    guard++;
  }
  return d;
}

/**
 * The date a subscription is ACTUALLY next charged on: the stored `nextRenewal` while it
 * is still ahead, otherwise the next occurrence of the same cycle after today.
 *
 * A cycle that never renews ('lifetime') is returned untouched — there is no next charge
 * to roll to, and stepping it would spin (addCycle returns the same date). An absent date
 * stays absent.
 */
export function effectiveNextRenewal(
  nextRenewal: string | Date | null | undefined,
  billingCycle: string | null | undefined,
  now: number = Date.now()
): Date | null {
  const stored = toDate(nextRenewal);
  if (!stored) return null;
  const cycle = billingCycle || 'monthly';
  if (!cycleRenews(cycle)) return stored;
  return roll(stored, cycle, (d) => renewalHasPassed(d, now));
}

/** ISO form of {@link effectiveNextRenewal}, for the serialized shapes the UI/API hand out. */
export function effectiveNextRenewalISO(
  nextRenewal: string | Date | null | undefined,
  billingCycle: string | null | undefined,
  now: number = Date.now()
): string | null {
  return effectiveNextRenewal(nextRenewal, billingCycle, now)?.toISOString() ?? null;
}

/**
 * The first occurrence on or after `boundary`, for the calendar/agenda projections.
 *
 * Deliberately NOT `effectiveNextRenewal`: those views draw a whole month, including the
 * days of it that have already gone by, so a charge that landed on the 3rd belongs in the
 * 3rd of this month rather than being rolled into next month's total. (Forward cashflow
 * ignores those past entries itself — see lib/safeToSpend.) What they need is a seed that
 * reaches the window at all, instead of a bounded step loop starting years behind it.
 */
export function renewalOnOrAfter(
  nextRenewal: string | Date | null | undefined,
  billingCycle: string | null | undefined,
  boundary: Date
): Date | null {
  const stored = toDate(nextRenewal);
  if (!stored) return null;
  const cycle = billingCycle || 'monthly';
  if (!cycleRenews(cycle)) return stored;
  return roll(stored, cycle, (d) => d < boundary);
}
