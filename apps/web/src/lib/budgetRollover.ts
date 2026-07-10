// Envelope / rollover budgeting (P25). Deterministic, DB-free, unit-testable.
//
// A plain monthly budget resets to its full cap every month: money you did NOT
// spend is simply lost, and a one-off overspend is forgotten next month. Envelope
// mode instead carries the NET unspent balance from recent complete months into
// the current month, so consistent saving accumulates room and an overspend eats
// into the following envelope. Opt-in per instance (AppConfig.budgetRollover).

/** How many complete prior months feed the carry. Kept small and fixed so the
 *  result is predictable and a stale/just-set budget can't inflate the carry
 *  indefinitely (matches the P27 suggest-budgets window). The caller further
 *  restricts this to months that actually had tracked spend, so empty untracked
 *  months never manufacture a fake surplus. */
export const ROLLOVER_WINDOW = 3;

export type Rollover = {
  /** Net € carried into this month = Σ (base − spent) over the tracked window.
   *  Positive when the category was under budget, negative when it overspent. */
  carried: number;
  /** The budget actually available this month = base + carried, floored at 0
   *  (an exhausted envelope offers nothing more until next month's base lands). */
  effective: number;
};

/**
 * Compute the net carry for a single budgeted category.
 *
 * @param base         the category's monthly base budget (€). ≤0 → no rollover.
 * @param priorSpends  spend (€) in each *tracked* complete prior month, one entry
 *                     per month (most-recent order is irrelevant — it's a sum).
 *                     The caller decides which months count so empty, untracked
 *                     months never inflate the carry.
 */
export function categoryRollover(base: number, priorSpends: readonly number[]): Rollover {
  if (!(base > 0)) return { carried: 0, effective: Math.max(0, Math.round(base) || 0) };
  let carried = 0;
  for (const raw of priorSpends) {
    const spent = raw > 0 ? raw : 0;
    carried += base - spent;
  }
  const carriedR = Math.round(carried);
  return { carried: carriedR, effective: Math.max(0, Math.round(base) + carriedR) };
}
