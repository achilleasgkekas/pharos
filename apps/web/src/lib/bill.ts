// P28 — pure, DB-free helpers for the bill / payable status tracker. A bill's
// status is DERIVED from its due date and whether it has been paid, so both the
// client list, the server actions, and the notification scan agree without any
// stored flag drifting out of sync.

export type BillStatus = 'paid' | 'overdue' | 'due-soon' | 'upcoming';

/** Whole days until the due date (negative = already past). null when no date. */
export function billDaysUntilDue(dueDate: string | Date | null | undefined, now: number = Date.now()): number | null {
  if (!dueDate) return null;
  const t = new Date(dueDate).getTime();
  if (Number.isNaN(t)) return null;
  return Math.ceil((t - now) / 86400000);
}

/**
 * Lifecycle status of a bill:
 *  - paid      → has a paidAt
 *  - overdue   → unpaid and the due date has passed
 *  - due-soon  → unpaid and due within `soonDays` (default 7)
 *  - upcoming  → unpaid and further out
 */
export function billStatus(
  dueDate: string | Date | null | undefined,
  paidAt: string | Date | null | undefined,
  now: number = Date.now(),
  soonDays = 7
): BillStatus {
  if (paidAt) return 'paid';
  const days = billDaysUntilDue(dueDate, now);
  if (days === null) return 'upcoming';
  if (days < 0) return 'overdue';
  if (days <= soonDays) return 'due-soon';
  return 'upcoming';
}

/** True when a bill still needs paying (unpaid, not archived). */
export function billIsOpen(paidAt: string | Date | null | undefined, archived = false): boolean {
  return !archived && !paidAt;
}

/** Advance a date by one billing cycle (used to spawn the next recurring instance). */
export function nextBillDue(dueDate: string | Date, cycle: string): Date {
  const n = new Date(dueDate);
  if (cycle === 'weekly') n.setDate(n.getDate() + 7);
  else if (cycle === 'quarterly') n.setMonth(n.getMonth() + 3);
  else if (cycle === 'yearly') n.setFullYear(n.getFullYear() + 1);
  else n.setMonth(n.getMonth() + 1); // monthly default
  return n;
}
