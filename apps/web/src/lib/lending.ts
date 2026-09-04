// P47 — pure, DB-free helpers for an item lent out to a friend or a relative.
//
// Deliberately NOT a status change: a drill at your brother's house is still YOUR drill,
// it stays in the inventory, it keeps its warranty and its maintenance clock. Only the
// answer to "where is it right now" differs. That is why lending is three optional fields
// on the item rather than a `lent` entry in the status enum, which would have dropped the
// thing out of every owned-item total the moment somebody borrowed it.
//
// Distinct from P44 (RMA: the thing goes back to the manufacturer, a process with a ticket
// number and an outcome) and from P41 (maintenance: a chore that recurs on the thing while
// it is home). Like lib/maintenance.ts, everything is DERIVED from the stored fields, so
// the card badge, the detail panel and the overdue scan that comes next cannot drift apart.

/** Item statuses where lending is meaningful: things actually owned and intact. */
export const LENDING_STATUSES = ['received', 'installed'] as const;

export function lendingApplies(status: string | null | undefined): boolean {
  return (LENDING_STATUSES as readonly string[]).includes(String(status ?? ''));
}

/** Longest borrower name we store. Free-form on purpose (the backlog's builder default):
 *  no link to a user account, because the people you lend a drill to do not have one. */
export const MAX_BORROWER_LENGTH = 80;

/**
 * Clamp a typed borrower name to something storable. Blank, whitespace or a non-string
 * means "not lent out" (''), never a stray space, so the absence round-trips through the
 * form. Trimmed and capped: the field is a name, not a note.
 */
export function normalizeBorrower(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.trim().slice(0, MAX_BORROWER_LENGTH);
}

/**
 * True when the item is currently out on loan. The borrower name is the ONE flag: an
 * item is lent because somebody has it, not because a date was filled in. Clearing the
 * name is therefore exactly "it came back", which is what markItemReturned() does.
 */
export function isLentOut(
  status: string | null | undefined,
  lentTo: string | null | undefined
): boolean {
  return lendingApplies(status) && normalizeBorrower(lentTo).length > 0;
}

export type LendingState = 'overdue' | 'due-soon' | 'ok';

/** Whole days until the loan is due back (negative = already late). Null when the item is
 *  not lent out, or is out with no deadline agreed — an open-ended loan is not late. */
export function lendingDaysUntilReturn(
  status: string | null | undefined,
  lentTo: string | null | undefined,
  expectedReturnAt: string | Date | null | undefined,
  now: number = Date.now()
): number | null {
  if (!isLentOut(status, lentTo)) return null;
  if (!expectedReturnAt) return null;
  const due = new Date(expectedReturnAt);
  if (Number.isNaN(due.getTime())) return null;
  return Math.ceil((due.getTime() - now) / 86400000);
}

/**
 * Urgency of a loan that has a deadline:
 *  - overdue  → the agreed date has passed
 *  - due-soon → within `soonDays` (default 3, shorter than maintenance: you ask for a
 *               drill back a couple of days out, not a week)
 *  - ok       → further out
 * Null when the item is home, or out with no agreed date.
 */
export function lendingState(
  status: string | null | undefined,
  lentTo: string | null | undefined,
  expectedReturnAt: string | Date | null | undefined,
  now: number = Date.now(),
  soonDays = 3
): LendingState | null {
  const days = lendingDaysUntilReturn(status, lentTo, expectedReturnAt, now);
  if (days === null) return null;
  if (days < 0) return 'overdue';
  if (days <= soonDays) return 'due-soon';
  return 'ok';
}

/** How long the thing has been gone, in whole days. Null when it is home or the lend date
 *  was never recorded. Used for the open-ended loans, which have nothing else to show. */
export function lendingDaysOut(
  status: string | null | undefined,
  lentTo: string | null | undefined,
  lentAt: string | Date | null | undefined,
  now: number = Date.now()
): number | null {
  if (!isLentOut(status, lentTo)) return null;
  if (!lentAt) return null;
  const from = new Date(lentAt);
  if (Number.isNaN(from.getTime())) return null;
  return Math.max(0, Math.floor((now - from.getTime()) / 86400000));
}
