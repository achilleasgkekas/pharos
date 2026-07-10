// P32 — pure, DB-free helpers for the gift-card / store-credit balance tracker.
// Balance = initialAmount − Σ(uses.amount). A positive use is a spend; a negative
// use is a reload/top-up. Kept isolated so it can be unit-tested and reused by the
// client card, the server actions, and the notification scan without pulling Mongoose.

export type GiftCardUseLike = { amount?: number | null };

/** Current balance, rounded to cents. */
export function giftCardBalance(initialAmount: number, uses: GiftCardUseLike[] = []): number {
  const base = Number(initialAmount) || 0;
  const spent = uses.reduce((s, u) => s + (Number(u?.amount) || 0), 0);
  return Math.round((base - spent) * 100) / 100;
}

/** How much of the face value has been used, 0–100 (clamped). 0 when no face value. */
export function giftCardSpentPct(initialAmount: number, uses: GiftCardUseLike[] = []): number {
  const base = Number(initialAmount) || 0;
  if (base <= 0) return 0;
  const spent = base - giftCardBalance(base, uses);
  const pct = (spent / base) * 100;
  return Math.max(0, Math.min(100, Math.round(pct)));
}

/** Whole days until expiry (negative = already expired). null when no expiry set. */
export function giftCardDaysLeft(expiresAt: string | Date | null | undefined, now: number = Date.now()): number | null {
  if (!expiresAt) return null;
  const t = new Date(expiresAt).getTime();
  if (Number.isNaN(t)) return null;
  return Math.ceil((t - now) / 86400000);
}

/** A card still holds money and is not archived. */
export function giftCardIsLive(initialAmount: number, uses: GiftCardUseLike[] = [], archived = false): boolean {
  return !archived && giftCardBalance(initialAmount, uses) > 0.009;
}
