import { addCycle } from '@/lib/billingCycle';
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

// ---------------------------------------------------------------------------
// P61 — partial payments. A bill used to be strictly binary (paidAt or not), which
// forced a lie on anything paid in instalments by hand (κοινόχρηστα με έκτακτη
// εισφορά, a ΔΕΗ arrears arrangement): either leave it "unpaid" and lose sight of
// what you already handed over, or mark it "paid" early and break overdue tracking.
//
// Deliberately kept ORTHOGONAL to billStatus() above, which still returns exactly
// its four states. A half-paid bill that is late must keep screaming "overdue" —
// folding payment progress into the urgency chip would mask that, and would also
// be a breaking change for the v1 API's `status` field and the notification scan.
// So progress is its own axis: the four-state urgency chip AND a payment state.
// ---------------------------------------------------------------------------

/** One manual payment toward a bill (mirrors GiftCardUseSchema). */
export type BillPayment = { amount?: number | null; date?: string | Date | null; note?: string };

export type BillPaymentState = 'unpaid' | 'partially-paid' | 'paid';

/** Money in cents-rounded form, so summing instalments never drifts on floats. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Total handed over so far. Payments are denominated in the deployment's BASE
 *  currency, same as `Bill.amount`, so this stays comparable for a foreign bill. */
export function billPaidAmount(payments: BillPayment[] | null | undefined): number {
  if (!Array.isArray(payments)) return 0;
  return round2(payments.reduce((s, p) => s + (Number(p?.amount) || 0), 0));
}

/** What is still owed. Never negative: an overpayment reads as settled, not as credit. */
export function billRemaining(
  amount: number | null | undefined,
  payments: BillPayment[] | null | undefined,
  paidAt?: string | Date | null
): number {
  if (paidAt) return 0;
  return round2(Math.max(0, (Number(amount) || 0) - billPaidAmount(payments)));
}

/**
 * Payment progress, independent of urgency:
 *  - paid           → settled (an explicit paidAt, or the instalments cover the amount)
 *  - partially-paid → something was paid, a balance remains
 *  - unpaid         → nothing paid yet (the pre-P61 default for every existing bill)
 *
 * A zero-amount bill is never auto-settled by a payment; there is no total to reach.
 */
export function billPaymentState(
  amount: number | null | undefined,
  payments: BillPayment[] | null | undefined,
  paidAt?: string | Date | null
): BillPaymentState {
  if (paidAt) return 'paid';
  const paid = billPaidAmount(payments);
  if (paid <= 0) return 'unpaid';
  const total = Number(amount) || 0;
  if (total > 0 && paid >= total) return 'paid';
  return 'partially-paid';
}

/** True once the instalments cover the bill, i.e. when logging one should settle it. */
export function billIsSettledByPayments(
  amount: number | null | undefined,
  payments: BillPayment[] | null | undefined
): boolean {
  const total = Number(amount) || 0;
  return total > 0 && billPaidAmount(payments) >= total;
}

/** Advance a date by one billing cycle (used to spawn the next recurring instance). */
export function nextBillDue(dueDate: string | Date, cycle: string): Date {
  // Stepping lives in lib/billingCycle.ts so a bill, a recurring expense and a
  // subscription all advance by the same rules (an unknown cycle still means monthly).
  return addCycle(new Date(dueDate), cycle);
}
