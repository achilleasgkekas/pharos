import { describe, it, expect } from 'vitest';
import { subscriptionSpaceCost } from './subscriptionSpaceCost';

describe('subscriptionSpaceCost (P68 φάση 2)', () => {
  it('untagged install: κανένας χώρος, άρα το card δεν εμφανίζεται καθόλου', () => {
    const map = subscriptionSpaceCost([
      { amount: 10, billingCycle: 'monthly', space: '' },
      { amount: 20, billingCycle: 'monthly' },
      { amount: 30, billingCycle: 'monthly', space: '   ' },
    ]);
    expect(map.size).toBe(0);
  });

  it('αθροίζει σε ΜΗΝΙΑΙΟ ισοδύναμο, όχι στο ποσό του κύκλου', () => {
    const map = subscriptionSpaceCost([
      { amount: 10, billingCycle: 'monthly', space: 'Kalamos' },
      { amount: 120, billingCycle: 'yearly', space: 'Kalamos' }, // 10/μήνα
    ]);
    expect(map.get('Kalamos')).toBeCloseTo(20, 6);
  });

  it('κρατά τους χώρους χωριστά και κάνει trim στο tag', () => {
    const map = subscriptionSpaceCost([
      { amount: 15, billingCycle: 'monthly', space: ' Kalamos ' },
      { amount: 5, billingCycle: 'monthly', space: 'Athens' },
    ]);
    expect([...map.keys()].sort()).toEqual(['Athens', 'Kalamos']);
    expect(map.get('Kalamos')).toBeCloseTo(15, 6);
  });

  it('lifetime δεν έχει μηνιαία χρέωση, άρα δεν μπαίνει', () => {
    const map = subscriptionSpaceCost([{ amount: 300, billingCycle: 'lifetime', space: 'Kalamos' }]);
    expect(map.size).toBe(0);
  });

  it('αγνοεί μη έγκυρα ή μη θετικά ποσά', () => {
    const map = subscriptionSpaceCost([
      { amount: 0, billingCycle: 'monthly', space: 'Kalamos' },
      { amount: -5, billingCycle: 'monthly', space: 'Kalamos' },
      { amount: Number.NaN, billingCycle: 'monthly', space: 'Kalamos' },
      { amount: null, billingCycle: 'monthly', space: 'Kalamos' },
    ]);
    expect(map.size).toBe(0);
  });

  it('null/undefined είσοδος γυρίζει κενό χάρτη', () => {
    expect(subscriptionSpaceCost(null).size).toBe(0);
    expect(subscriptionSpaceCost(undefined).size).toBe(0);
  });
});
