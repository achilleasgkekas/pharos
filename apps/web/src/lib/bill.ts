import { addCycle } from '@/lib/billingCycle';
import { needsFxRate } from '@/lib/fx';
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

/** One manual payment toward a bill. */
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

/**
 * The fields the payment helpers below read. The P9 triple (currency / origAmount / fxRate)
 * is part of it on purpose: a bill's `amount` is only comparable with its base-currency
 * instalments when it really IS base currency, and that is decided by those three fields.
 */
export type BillMoney = {
  amount?: number | null;
  payments?: BillPayment[] | null;
  paidAt?: string | Date | null;
  currency?: string | null;
  origAmount?: number | null;
  fxRate?: number | null;
};

/**
 * #297: a foreign bill saved without an exchange rate keeps its PRINTED figure in `amount`
 * (resolveFx refuses to guess 1:1). That figure is not base currency, so it can neither be
 * compared with the base-currency instalments nor summed into a base-currency total. Every
 * helper below takes the base code for exactly this reason: forgetting the check is a type
 * error, not a silent €100 = $100.
 */
export function billNeedsRate(b: BillMoney, base: string): boolean {
  return needsFxRate(b, base);
}

/**
 * What is still owed, in base currency. Never negative: an overpayment reads as settled,
 * not as credit. `null` when it cannot be known because the bill still needs an exchange
 * rate (#297): callers must leave it out of any total rather than add a foreign figure in.
 */
export function billRemaining(b: BillMoney, base: string): number | null {
  if (b.paidAt) return 0;
  if (billNeedsRate(b, base)) return null;
  return round2(Math.max(0, (Number(b.amount) || 0) - billPaidAmount(b.payments)));
}

/**
 * Payment progress, independent of urgency:
 *  - paid           → settled (an explicit paidAt, or the instalments cover the amount)
 *  - partially-paid → something was paid, a balance remains
 *  - unpaid         → nothing paid yet (the pre-P61 default for every existing bill)
 *
 * A zero-amount bill is never auto-settled by a payment; there is no total to reach. Nor is
 * a bill still waiting for an exchange rate (#297): its instalments are base currency, its
 * amount is not, so "covered" cannot be decided until the rate is in.
 */
export function billPaymentState(b: BillMoney, base: string): BillPaymentState {
  if (b.paidAt) return 'paid';
  const paid = billPaidAmount(b.payments);
  if (paid <= 0) return 'unpaid';
  if (billIsSettledByPayments(b, base)) return 'paid';
  return 'partially-paid';
}

/** True once the instalments cover the bill, i.e. when logging one should settle it. */
export function billIsSettledByPayments(b: BillMoney, base: string): boolean {
  if (billNeedsRate(b, base)) return false;
  const total = Number(b.amount) || 0;
  return total > 0 && billPaidAmount(b.payments) >= total;
}

/** Advance a date by one billing cycle (used to spawn the next recurring instance). */
export function nextBillDue(dueDate: string | Date, cycle: string): Date {
  // Stepping lives in lib/billingCycle.ts so a bill, a recurring expense and a
  // subscription all advance by the same rules (an unknown cycle still means monthly).
  return addCycle(new Date(dueDate), cycle);
}
