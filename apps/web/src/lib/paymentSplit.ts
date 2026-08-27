// P62 — pure, DB-free helpers for splitting ONE purchase across several PAYMENT
// METHODS (e.g. 30 EUR off an IKEA gift card + 45 EUR on a card). Deliberately
// distinct from lib/split.ts (P35), which splits an expense between PEOPLE: there
// the question is "who owes me what", here it is "which of MY methods paid this".
// The two are independent and can coexist on the same expense.
//
// Convention: an entry's `amount` is in the same (base) currency as the expense's
// stored `amount`. An empty array means "paid with the single `paymentMethod`
// field" — exactly the pre-P62 behaviour, so nothing changes until a user opts in.
// `giftCardId` optionally links a row to a P32 gift card, which is what lets the
// server mirror the row into that card's `uses[]` spend log automatically.

export type PaymentSplitEntry = { method: string; amount: number; giftCardId: string };

/** Round to cents. */
function r2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** Clean raw rows: trim, round to cents, drop rows that name neither a method nor a
 *  gift card. Shared by the web server action and any API write path so a split
 *  submitted by a client is sanitized identically (mirrors cleanSplit of P35). */
export function cleanPaymentSplits(
  rows: Array<{ method?: string; amount?: number; giftCardId?: string }>
): PaymentSplitEntry[] {
  return (rows || [])
    .map((r) => ({
      method: (r?.method || '').trim().slice(0, 80),
      amount: r2(Number(r?.amount) || 0),
      giftCardId: (r?.giftCardId || '').trim(),
    }))
    .filter((r) => r.method.length > 0 || r.giftCardId.length > 0);
}

/** Sum of every row, rounded to cents. */
export function paymentSplitTotal(splits: PaymentSplitEntry[] = []): number {
  return r2((splits || []).reduce((s, r) => s + (Number(r?.amount) || 0), 0));
}

/** What is still unaccounted for: expense total − Σ rows. Negative = over-allocated. */
export function paymentSplitRemainder(total: number, splits: PaymentSplitEntry[] = []): number {
  return r2((Number(total) || 0) - paymentSplitTotal(splits));
}

/** Do the rows add up to the expense total? Cent-tolerant, so a rounding artefact
 *  never reads as an error. An EMPTY split is always balanced: it means the split
 *  feature is simply not in use for this expense. */
export function paymentSplitsBalance(total: number, splits: PaymentSplitEntry[] = []): boolean {
  if (!splits || splits.length === 0) return true;
  return Math.abs(paymentSplitRemainder(total, splits)) < 0.005;
}

/** Put whatever is left over onto the LAST row, so one click makes the rows add up
 *  to the total (the P62 equivalent of P35's "split equally" convenience). Returns
 *  the rows untouched when there is nothing to place. */
export function balancePaymentSplits(total: number, splits: PaymentSplitEntry[] = []): PaymentSplitEntry[] {
  const rows = splits || [];
  if (rows.length === 0) return rows;
  const rest = paymentSplitRemainder(total, rows);
  if (rest === 0) return rows;
  return rows.map((r, i) => (i === rows.length - 1 ? { ...r, amount: r2((Number(r.amount) || 0) + rest) } : r));
}

/** Aggregate how much of this purchase each linked gift card paid for, so the server
 *  can write ONE `uses[]` entry per card even when a card appears on several rows.
 *  Rows with no card, or that round to zero, are skipped — a zero-value spend log
 *  entry would be noise on the card's history. */
export function giftCardSpend(splits: PaymentSplitEntry[] = []): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of splits || []) {
    const id = (r?.giftCardId || '').trim();
    if (!id) continue;
    m.set(id, r2((m.get(id) ?? 0) + (Number(r.amount) || 0)));
  }
  for (const [id, amt] of [...m]) if (amt === 0) m.delete(id);
  return m;
}
