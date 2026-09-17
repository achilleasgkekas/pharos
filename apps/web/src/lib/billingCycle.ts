// ONE source of truth for subscription / recurring billing cycles.
//
// This knowledge used to be copy-pasted in seven places with three different shapes:
// the Mongoose enum, a `CYCLES` string tuple in the server action, a `{value, perMonth}`
// table in the client, two hand-written `CYCLE_PER_MONTH` maps (web /reports and
// /api/v1/reports), and two hand-written `addCycle()` steppers (lib/moneyAgenda and
// /calendar). Adding a cycle meant remembering all seven, and the ones that were missed
// did not fail loudly — they silently fell through to "monthly", quietly producing wrong
// money. (That is exactly how 'biennial' first went missing, and why aiTools' roll-up
// counted a weekly subscription as if it cost its weekly price once a month.)
//
// Anything that needs to know about a cycle imports from here.

export type BillingCycle = 'weekly' | 'monthly' | 'quarterly' | 'biennial' | 'yearly' | 'lifetime';

type CycleSpec = {
  value: BillingCycle;
  /** How many times a year it is charged, expressed per month. 0 = never recurs. */
  perMonth: number;
  /** Step used to roll a date forward one cycle. */
  step: { days?: number; months?: number; years?: number } | null;
};

// Ordered shortest → longest, which is also the order the pickers render.
const SPECS: CycleSpec[] = [
  { value: 'weekly', perMonth: 52 / 12, step: { days: 7 } },
  { value: 'monthly', perMonth: 1, step: { months: 1 } },
  { value: 'quarterly', perMonth: 1 / 3, step: { months: 3 } },
  { value: 'yearly', perMonth: 1 / 12, step: { years: 1 } },
  { value: 'biennial', perMonth: 1 / 24, step: { years: 2 } }, // every 2 years
  { value: 'lifetime', perMonth: 0, step: null }, // paid once, never renews
];

/** Every cycle value, in picker order. */
export const BILLING_CYCLES: readonly BillingCycle[] = SPECS.map((c) => c.value);

/** Tuple form for `z.enum(...)`, which needs a non-empty readonly tuple. */
export const BILLING_CYCLE_VALUES = BILLING_CYCLES as unknown as readonly [BillingCycle, ...BillingCycle[]];

function specOf(cycle: string): CycleSpec {
  return SPECS.find((c) => c.value === cycle) ?? SPECS[1]; // unknown → monthly, as before
}

/** Is this a real cycle we know about? */
export function isBillingCycle(v: unknown): v is BillingCycle {
  return typeof v === 'string' && BILLING_CYCLES.includes(v as BillingCycle);
}

/**
 * Multiplier turning one charge into its monthly-equivalent cost, so subscriptions on
 * different cycles can be summed into a single "per month" figure. Lifetime is 0: it
 * is already paid and does not recur, so it must not inflate a monthly total.
 */
export function monthlyFactor(cycle: string): number {
  return specOf(cycle).perMonth;
}

/** One charge's monthly-equivalent cost. */
export function monthlyEquivalent(amount: number, cycle: string): number {
  return (Number(amount) || 0) * monthlyFactor(cycle);
}

/** Does this cycle ever renew? (false only for 'lifetime'.) */
export function cycleRenews(cycle: string): boolean {
  return specOf(cycle).step !== null;
}

/**
 * Roll a date forward by exactly one cycle. A non-renewing cycle returns the date
 * unchanged — callers that iterate MUST check `cycleRenews` first, or they would spin.
 */
export function addCycle(d: Date, cycle: string): Date {
  const spec = specOf(cycle);
  const n = new Date(d);
  if (!spec.step) return n;
  if (spec.step.days) n.setDate(n.getDate() + spec.step.days);
  if (spec.step.months) n.setMonth(n.getMonth() + spec.step.months);
  if (spec.step.years) n.setFullYear(n.getFullYear() + spec.step.years);
  return n;
}

/**
 * addCycle for DATE-ONLY values, which the app stores as UTC midnight (`safeDate('2026-05-01')`
 * → 2026-05-01T00:00Z). The local-time setters above shift such a value whenever the server's TZ
 * is behind UTC: 2026-05-01T00Z is Apr 30 20:00 in New York, "+1 month" there is May 30 20:00 =
 * May 31 00Z, and a monthly series drifts a day earlier every step (#103). UTC setters keep the
 * calendar day exactly, on any host.
 */
export function addCycleUTC(d: Date, cycle: string): Date {
  const spec = specOf(cycle);
  const n = new Date(d);
  if (!spec.step) return n;
  if (spec.step.days) n.setUTCDate(n.getUTCDate() + spec.step.days);
  if (spec.step.months) n.setUTCMonth(n.getUTCMonth() + spec.step.months);
  if (spec.step.years) n.setUTCFullYear(n.getUTCFullYear() + spec.step.years);
  return n;
}

/**
 * Roll `start` forward one cycle at a time until it is in the future. Returns null for
 * a cycle that never renews. The guard bounds the loop for a pathological start date
 * (e.g. year 1900 on a weekly cycle is ~6500 steps, so the ceiling sits above that).
 */
export function nextOccurrence(start: Date, cycle: string, now: Date = new Date()): Date | null {
  if (!cycleRenews(cycle)) return null;
  let next = new Date(start);
  let guard = 0;
  while (next.getTime() <= now.getTime() && guard < 10000) {
    next = addCycle(next, cycle);
    guard++;
  }
  return next;
}

/** i18n key for a cycle's adjective form ("Monthly"), used by the pickers/badges. */
export function cycleKey(cycle: string): string {
  return `cyc.${specOf(cycle).value}`;
}

// ── Recurring bills / expenses ────────────────────────────────────────────────
// Bills (P28) and recurring expense series use the same cycles as subscriptions with
// two differences: '' means "not recurring at all" (a one-off), and 'lifetime' has no
// meaning — a thing you pay once is simply not recurring. They kept their own hand-
// written lists and their own steppers (expenses/actions.ts and lib/bill.ts each had a
// private copy), which is why the every-2-years cycle was missing here as well.

export type RecurringCycle = '' | Exclude<BillingCycle, 'lifetime'>;

/** Cycles a bill / recurring expense can have, '' (one-off) first. */
export const RECURRING_CYCLES: readonly RecurringCycle[] = [
  '',
  ...SPECS.filter((c) => c.step !== null).map((c) => c.value as Exclude<BillingCycle, 'lifetime'>),
];

/** Tuple form for `z.enum(...)`. */
export const RECURRING_CYCLE_VALUES = RECURRING_CYCLES as unknown as readonly [RecurringCycle, ...RecurringCycle[]];

/** Is this one of the recurring-series cycles ('' included)? */
export function isRecurringCycle(v: unknown): v is RecurringCycle {
  return typeof v === 'string' && RECURRING_CYCLES.includes(v as RecurringCycle);
}
