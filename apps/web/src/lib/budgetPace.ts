// P100 — budget "pace": project a category's month-end spend from what has been spent so
// far this month (spend-so-far / days-elapsed × days-in-month). Pure + no model, no AI — the
// Reports page already has the per-category actuals and the budget limits; this only reads the
// clock. Separate from P19 safe-to-spend (cashflow-wide): this is per-category budget pacing.

/**
 * Linear month-end projection of spend from the running total.
 * Guards the degenerate ends: day 0 / no days → return the actual (nothing to extrapolate);
 * on or past the last day the projection IS the actual (the month is effectively done).
 */
export function projectMonthEnd(actual: number, dayOfMonth: number, daysInMonth: number): number {
  if (dayOfMonth <= 0 || daysInMonth <= 0) return actual;
  if (dayOfMonth >= daysInMonth) return actual;
  return Math.round((actual / dayOfMonth) * daysInMonth);
}

/** True when the projected month-end spend would exceed the limit (limit>0 only). */
export function isOverPace(projected: number, limit: number): boolean {
  return limit > 0 && projected > limit;
}

/**
 * A pace line is only worth showing mid-month once something has been spent: on day 1 the
 * projection is wild, and on the last day it equals the actual (no new signal). Callers hide
 * the line when this is false.
 */
export function paceMeaningful(actual: number, dayOfMonth: number, daysInMonth: number): boolean {
  return actual > 0 && dayOfMonth >= 1 && dayOfMonth < daysInMonth;
}
