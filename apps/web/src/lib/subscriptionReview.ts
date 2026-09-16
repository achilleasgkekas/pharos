export type ReviewableSubscription = {
  _id: unknown;
  name: string;
  createdAt?: string | Date | null;
  lastReviewedAt?: string | Date | null;
  pausedUntil?: string | Date | null;
};

export type SubscriptionReviewDue = ReviewableSubscription & { days: number; iso: string };

/** Find active subscriptions whose user-confirmation clock has elapsed. */
export function collectSubscriptionReviews(
  rows: readonly ReviewableSubscription[],
  intervalDays: number,
  now = Date.now()
): SubscriptionReviewDue[] {
  if (!Number.isFinite(intervalDays) || intervalDays <= 0) return [];
  const interval = Math.round(intervalDays);
  return rows
    .flatMap((row) => {
      // A deliberate pause already answers the behavioural question for its duration.
      const pausedUntil = row.pausedUntil ? new Date(row.pausedUntil).getTime() : NaN;
      if (Number.isFinite(pausedUntil) && pausedUntil > now) return [];
      const anchor = new Date(row.lastReviewedAt ?? row.createdAt ?? '').getTime();
      if (!Number.isFinite(anchor)) return [];
      const days = Math.floor((now - anchor) / 86400000);
      if (days < interval) return [];
      return [{ ...row, days, iso: new Date(anchor).toISOString().slice(0, 10) }];
    })
    .sort((a, b) => b.days - a.days);
}
