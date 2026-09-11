import { describe, it, expect } from 'vitest';
import {
  subscriptionDupeKey,
  subDupeCompleteness,
  groupSubscriptionDupes,
  type DupeSubscription,
} from './subscriptionDupes';

// P85 — subscription duplicate detection. The grouping RULE is the whole feature, so what
// is pinned here is mostly what must NOT group: nameless/zero-amount rows, and two genuinely
// different plans (different amount or cycle) of the same provider.

function sub(over: Partial<DupeSubscription> = {}): DupeSubscription {
  return {
    _id: 'a1',
    name: 'Netflix',
    nameKey: 'netflix',
    amount: 15.99,
    billingCycle: 'monthly',
    provider: 'Netflix',
    category: 'entertainment',
    currency: 'EUR',
    active: true,
    paymentMethod: '',
    notes: '',
    url: '',
    splitCount: 0,
    hasFx: false,
    ...over,
  };
}

describe('subscriptionDupeKey', () => {
  it('is stable across two identical plans (same name/amount/cycle)', () => {
    expect(subscriptionDupeKey(sub())).toBe(subscriptionDupeKey(sub({ _id: 'b2' })));
  });

  it('returns "" when the name normalizes to nothing', () => {
    expect(subscriptionDupeKey(sub({ nameKey: '' }))).toBe('');
    expect(subscriptionDupeKey(sub({ nameKey: '   ' }))).toBe('');
  });

  it('returns "" for a free / non-positive amount', () => {
    expect(subscriptionDupeKey(sub({ amount: 0 }))).toBe('');
    expect(subscriptionDupeKey(sub({ amount: -3 }))).toBe('');
  });

  it('separates two different plans of the same provider by amount', () => {
    expect(subscriptionDupeKey(sub({ amount: 5 }))).not.toBe(subscriptionDupeKey(sub({ amount: 15 })));
  });

  it('separates a monthly plan from a yearly plan of the same name/amount', () => {
    expect(subscriptionDupeKey(sub({ billingCycle: 'monthly' }))).not.toBe(
      subscriptionDupeKey(sub({ billingCycle: 'yearly' }))
    );
  });

  it('treats an empty cycle as monthly', () => {
    expect(subscriptionDupeKey(sub({ billingCycle: '' }))).toBe(subscriptionDupeKey(sub({ billingCycle: 'monthly' })));
  });
});

describe('subDupeCompleteness', () => {
  it('ranks an active subscription above a cancelled twin', () => {
    expect(subDupeCompleteness(sub({ active: true }))).toBeGreaterThan(
      subDupeCompleteness(sub({ active: false }))
    );
  });

  it('rewards filled-in fields', () => {
    const bare = sub({ active: false, provider: '', category: 'other', url: '', notes: '' });
    const rich = sub({ active: false, provider: 'Netflix', category: 'entertainment', url: 'https://x', notes: 'n' });
    expect(subDupeCompleteness(rich)).toBeGreaterThan(subDupeCompleteness(bare));
  });
});

describe('groupSubscriptionDupes', () => {
  it('drops singletons (nothing to merge)', () => {
    expect(groupSubscriptionDupes([sub()])).toEqual([]);
  });

  it('groups a re-signup pair and puts the active one first', () => {
    const groups = groupSubscriptionDupes([
      sub({ _id: 'old', active: false }),
      sub({ _id: 'new', active: true }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].entries.map((e) => e._id)).toEqual(['new', 'old']);
  });

  it('does not group two different plans of the same provider', () => {
    const groups = groupSubscriptionDupes([
      sub({ _id: 'm', amount: 5 }),
      sub({ _id: 'y', amount: 15, billingCycle: 'yearly' }),
    ]);
    expect(groups).toEqual([]);
  });

  it('orders groups biggest cluster / most expensive first', () => {
    const groups = groupSubscriptionDupes([
      // pair, cheap
      sub({ _id: 'c1', nameKey: 'spotify', name: 'Spotify', amount: 9.99 }),
      sub({ _id: 'c2', nameKey: 'spotify', name: 'Spotify', amount: 9.99, active: false }),
      // triple, so it should come first
      sub({ _id: 'n1' }),
      sub({ _id: 'n2', active: false }),
      sub({ _id: 'n3', active: false }),
    ]);
    expect(groups.map((g) => g.entries.length)).toEqual([3, 2]);
  });
});
