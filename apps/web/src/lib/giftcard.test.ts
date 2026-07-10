import { describe, expect, it } from 'vitest';
import { giftCardBalance, giftCardSpentPct, giftCardDaysLeft, giftCardIsLive } from './giftcard';

describe('giftCardBalance', () => {
  it('is the face value when unused', () => {
    expect(giftCardBalance(50, [])).toBe(50);
  });

  it('subtracts the sum of spends', () => {
    expect(giftCardBalance(50, [{ amount: 12.5 }, { amount: 7.25 }])).toBe(30.25);
  });

  it('treats a negative use as a reload (balance grows)', () => {
    expect(giftCardBalance(20, [{ amount: 5 }, { amount: -10 }])).toBe(25);
  });

  it('rounds to cents and tolerates missing/NaN amounts', () => {
    expect(giftCardBalance(10, [{ amount: 3.333 }, { amount: null }, {}])).toBe(6.67);
  });

  it('can go negative if over-spent (data entry error surfaces, not hidden)', () => {
    expect(giftCardBalance(10, [{ amount: 15 }])).toBe(-5);
  });
});

describe('giftCardSpentPct', () => {
  it('is 0 with no face value', () => {
    expect(giftCardSpentPct(0, [{ amount: 5 }])).toBe(0);
  });

  it('is a rounded 0–100 percentage of face value used', () => {
    expect(giftCardSpentPct(100, [{ amount: 40 }])).toBe(40);
    expect(giftCardSpentPct(30, [{ amount: 10 }])).toBe(33);
  });

  it('clamps to [0,100] even when over/under spent', () => {
    expect(giftCardSpentPct(10, [{ amount: 25 }])).toBe(100);
    expect(giftCardSpentPct(10, [{ amount: -5 }])).toBe(0);
  });
});

describe('giftCardDaysLeft', () => {
  const NOW = Date.UTC(2026, 0, 1); // 2026-01-01

  it('is null without an expiry', () => {
    expect(giftCardDaysLeft(null, NOW)).toBeNull();
    expect(giftCardDaysLeft(undefined, NOW)).toBeNull();
    expect(giftCardDaysLeft('not a date', NOW)).toBeNull();
  });

  it('counts whole days ahead', () => {
    expect(giftCardDaysLeft(new Date(NOW + 10 * 86400000), NOW)).toBe(10);
  });

  it('is negative once expired', () => {
    expect(giftCardDaysLeft(new Date(NOW - 3 * 86400000), NOW)).toBe(-3);
  });
});

describe('giftCardIsLive', () => {
  it('is true when it still holds money and is not archived', () => {
    expect(giftCardIsLive(50, [{ amount: 20 }])).toBe(true);
  });

  it('is false when emptied', () => {
    expect(giftCardIsLive(50, [{ amount: 50 }])).toBe(false);
  });

  it('is false when archived even with balance', () => {
    expect(giftCardIsLive(50, [{ amount: 20 }], true)).toBe(false);
  });
});
