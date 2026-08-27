import { describe, it, expect } from 'vitest';
import {
  cleanPaymentSplits,
  paymentSplitTotal,
  paymentSplitRemainder,
  paymentSplitsBalance,
  balancePaymentSplits,
  giftCardSpend,
  type PaymentSplitEntry,
} from './paymentSplit';

// P62 — pure helpers, no DB. These pin the two properties the feature rests on:
// (1) an EMPTY split always means "unchanged, single-method payment", never an error;
// (2) the gift-card mirror derives ONE amount per card, so re-saving an expense can
//     replace exactly what it wrote before.

const row = (method: string, amount: number, giftCardId = ''): PaymentSplitEntry => ({ method, amount, giftCardId });

describe('cleanPaymentSplits', () => {
  it('trims, rounds to cents and keeps well-formed rows', () => {
    expect(cleanPaymentSplits([{ method: '  Cash ', amount: 10.005, giftCardId: ' g1 ' }])).toEqual([
      { method: 'Cash', amount: 10.01, giftCardId: 'g1' },
    ]);
  });

  it('drops rows that name neither a method nor a gift card', () => {
    expect(cleanPaymentSplits([{ method: '   ', amount: 5, giftCardId: '' }, { method: 'Visa', amount: 5 }])).toEqual([
      { method: 'Visa', amount: 5, giftCardId: '' },
    ]);
  });

  it('keeps a row that only names a gift card (the method label is optional)', () => {
    expect(cleanPaymentSplits([{ amount: 30, giftCardId: 'g1' }])).toEqual([{ method: '', amount: 30, giftCardId: 'g1' }]);
  });

  it('degrades garbage to safe values instead of throwing', () => {
    expect(cleanPaymentSplits([{ method: 'Cash', amount: NaN }])).toEqual([{ method: 'Cash', amount: 0, giftCardId: '' }]);
    expect(cleanPaymentSplits(undefined as unknown as [])).toEqual([]);
  });

  it('caps a runaway method label at 80 chars', () => {
    expect(cleanPaymentSplits([{ method: 'x'.repeat(200), amount: 1 }])[0].method).toHaveLength(80);
  });
});

describe('paymentSplitTotal / paymentSplitRemainder', () => {
  it('sums the rows and reports what is left of the total', () => {
    const rows = [row('Gift card', 30), row('Visa', 45)];
    expect(paymentSplitTotal(rows)).toBe(75);
    expect(paymentSplitRemainder(75, rows)).toBe(0);
    expect(paymentSplitRemainder(100, rows)).toBe(25);
  });

  it('reports an over-allocated split as a negative remainder', () => {
    expect(paymentSplitRemainder(50, [row('Visa', 60)])).toBe(-10);
  });

  it('does not accumulate float noise', () => {
    expect(paymentSplitTotal([row('a', 0.1), row('b', 0.2)])).toBe(0.3);
  });
});

describe('paymentSplitsBalance', () => {
  it('treats an EMPTY split as balanced — the feature is simply not in use', () => {
    expect(paymentSplitsBalance(75, [])).toBe(true);
    expect(paymentSplitsBalance(0, [])).toBe(true);
  });

  it('accepts a sub-cent rounding artefact but not a real mismatch', () => {
    expect(paymentSplitsBalance(75, [row('a', 74.999)])).toBe(true);
    expect(paymentSplitsBalance(75, [row('a', 74.98)])).toBe(false);
  });
});

describe('balancePaymentSplits', () => {
  it('drops the leftover onto the last row so the rows add up exactly', () => {
    const out = balancePaymentSplits(100, [row('Gift card', 30), row('Visa', 45)]);
    expect(out.map((r) => r.amount)).toEqual([30, 70]);
    expect(paymentSplitsBalance(100, out)).toBe(true);
  });

  it('subtracts from the last row when the split is over the total', () => {
    const out = balancePaymentSplits(50, [row('Visa', 60)]);
    expect(out[0].amount).toBe(50);
  });

  it('is a no-op on an empty or already-balanced split', () => {
    expect(balancePaymentSplits(100, [])).toEqual([]);
    const rows = [row('Visa', 100)];
    expect(balancePaymentSplits(100, rows)).toBe(rows);
  });

  it('leaves the method and gift-card link of the touched row alone', () => {
    const out = balancePaymentSplits(100, [row('IKEA card', 30, 'g1')]);
    expect(out[0]).toEqual({ method: 'IKEA card', amount: 100, giftCardId: 'g1' });
  });
});

describe('giftCardSpend', () => {
  it('maps each linked card to the amount it paid', () => {
    expect([...giftCardSpend([row('IKEA', 30, 'g1'), row('Visa', 45)])]).toEqual([['g1', 30]]);
  });

  it('collapses several rows on the SAME card into one amount', () => {
    expect(giftCardSpend([row('IKEA', 30, 'g1'), row('IKEA', 12.5, 'g1')]).get('g1')).toBe(42.5);
  });

  it('skips rows with no card, and cards whose rows cancel out to zero', () => {
    const m = giftCardSpend([row('Cash', 20), row('IKEA', 30, 'g1'), row('IKEA refund', -30, 'g1')]);
    expect(m.size).toBe(0);
  });

  it('returns an empty map for an empty split', () => {
    expect(giftCardSpend([]).size).toBe(0);
  });
});
