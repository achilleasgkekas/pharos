import { createHash } from 'node:crypto';

/**
 * #299 — deterministic ids for the money a bill payment writes, the same trick as
 * `recurringExpenseId` (#69). Paying a bill touches two documents (the expense in the ledger and
 * the payment on the bill), and a double-click can run the whole thing twice before either write
 * lands. With a derived `_id` the second write loses on the `_id` index instead of booking a
 * second copy, and a retry after a half-failed attempt lands on the SAME ids, so it completes the
 * first attempt instead of starting a new one.
 */
function derive(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 24);
}

/** The expense "Mark paid" logs for a bill. A bill books at most one (see `linkedExpenseId`). */
export function billPaidExpenseId(billId: string): string {
  return derive(`bill-paid-expense:${billId}`);
}

/** One P61 instalment, identified by the key the payment form minted when it opened. */
export function billPaymentId(billId: string, key: string): string {
  return derive(`bill-payment:${billId}|${key}`);
}

/** The opt-in expense that instalment logs. */
export function billPaymentExpenseId(billId: string, key: string): string {
  return derive(`bill-payment-expense:${billId}|${key}`);
}
