// P83 — sweep a budget category's unspent leftover into a savings goal.
//
// Two already-shipped mechanisms, joined with ZERO new money math: P25 (envelope /
// rollover budgeting) already knows how much of a category's envelope is still
// unspent this month, and P12 (savings goals) already stores manual contributions.
// Until now that leftover just sat there with no way to reach a goal. This module
// is the deterministic, DB-free glue: how much may be swept, and under which
// bookkeeping note the transfer is recorded.
//
// The transfer itself is an ORDINARY GoalContribution — no schema change, so a
// swept euro can be inspected, and removed, exactly like a hand-typed one.

/** Prefix of the note stored on a swept contribution. The full note is an exact,
 *  machine-matchable string (see `sweepNote`), which is how a category+month is
 *  recognised as already swept — both in the UI and in the server-side guard. */
export const SWEEP_NOTE_PREFIX = 'Budget sweep';

/**
 * The bookkeeping note for sweeping `category`'s leftover of month `monthKey`
 * ("YYYY-MM"). Deterministic and human-readable, e.g.
 * `Budget sweep · groceries · 2026-08`.
 */
export function sweepNote(category: string, monthKey: string): string {
  return `${SWEEP_NOTE_PREFIX} · ${String(category).trim()} · ${String(monthKey).trim()}`;
}

/** "YYYY-MM", the shape every caller here uses for a month. */
export function isMonthKey(s: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(s));
}

/**
 * How much of `category`'s month has ALREADY been swept, over the contributions of
 * every (non-archived) goal. Any positive match means the month is done: the rule
 * is one sweep per category+month, enforced identically in the server action.
 */
export function sweptForMonth(
  contributions: readonly { amount?: number; note?: string }[],
  category: string,
  monthKey: string
): number {
  const note = sweepNote(category, monthKey);
  let total = 0;
  for (const c of contributions) {
    if ((c.note ?? '') !== note) continue;
    const amt = Number(c.amount);
    if (Number.isFinite(amt) && amt > 0) total += amt;
  }
  return Math.round(total * 100) / 100;
}

/**
 * The amount offered for sweeping, in whole euro (the budget card is rounded to
 * whole euro throughout, so the button can never offer a cent the bar doesn't show).
 *
 * @param limit        the month's spending limit for the category — the rolling
 *                     `effective` envelope in P25 mode, i.e. base + carried.
 * @param actual       what the category actually spent this month.
 * @param alreadySwept Σ of earlier sweeps of this same category+month. Anything
 *                     above zero means the month is spent: the leftover shrinks as
 *                     the month goes on (spend only grows), so a second sweep would
 *                     move money that is no longer there.
 */
export function sweepableLeftover(limit: number, actual: number, alreadySwept = 0): number {
  if (alreadySwept > 0) return 0;
  const left = Math.round(Number(limit) || 0) - Math.round(Number(actual) || 0);
  return left > 0 ? left : 0;
}
