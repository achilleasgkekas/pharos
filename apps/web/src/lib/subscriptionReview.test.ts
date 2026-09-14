import { describe, expect, it } from 'vitest';
import { collectSubscriptionReviews } from './subscriptionReview';

const NOW = new Date('2026-09-13T12:00:00Z').getTime();

describe('collectSubscriptionReviews', () => {
  it('uses the last confirmation, falling back to creation, and sorts stalest first', () => {
    const rows = collectSubscriptionReviews([
      { _id: 'reviewed', name: 'Reviewed', createdAt: '2020-01-01', lastReviewedAt: '2026-03-01' },
      { _id: 'never', name: 'Never', createdAt: '2025-01-01' },
      { _id: 'fresh', name: 'Fresh', createdAt: '2026-08-01' },
    ], 180, NOW);
    expect(rows.map((r) => r._id)).toEqual(['never', 'reviewed']);
    expect(rows[1]).toMatchObject({ days: 196, iso: '2026-03-01' });
  });

  it('is opt-in and ignores an actively paused subscription', () => {
    const old = { _id: 's1', name: 'Old', createdAt: '2020-01-01', pausedUntil: '2026-10-01' };
    expect(collectSubscriptionReviews([old], 0, NOW)).toEqual([]);
    expect(collectSubscriptionReviews([old], 180, NOW)).toEqual([]);
  });
});
