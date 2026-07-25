import { describe, it, expect } from 'vitest';
import {
  normalizeCurrency,
  isForeignCurrency,
  convertToBase,
  deriveFxRate,
  resolveFx,
  formatMoney,
  fxBadgeLabel,
} from './fx';

describe('normalizeCurrency', () => {
  it('uppercases a valid 3-letter code', () => {
    expect(normalizeCurrency('usd')).toBe('USD');
    expect(normalizeCurrency(' eur ')).toBe('EUR');
  });

  it('rejects anything that is not exactly 3 letters', () => {
    expect(normalizeCurrency('')).toBe('');
    expect(normalizeCurrency(null)).toBe('');
    expect(normalizeCurrency(undefined)).toBe('');
    expect(normalizeCurrency('EU')).toBe('');
    expect(normalizeCurrency('EUROS')).toBe('');
    expect(normalizeCurrency('US1')).toBe('');
    expect(normalizeCurrency('€')).toBe('');
  });
});

describe('isForeignCurrency', () => {
  it('is false for blank, junk, or the base code itself', () => {
    expect(isForeignCurrency('', 'EUR')).toBe(false);
    expect(isForeignCurrency(null, 'EUR')).toBe(false);
    expect(isForeignCurrency('nonsense', 'EUR')).toBe(false);
    expect(isForeignCurrency('EUR', 'EUR')).toBe(false);
    expect(isForeignCurrency('eur', 'EUR')).toBe(false);
  });

  it('is true only for a different valid code', () => {
    expect(isForeignCurrency('USD', 'EUR')).toBe(true);
    expect(isForeignCurrency('EUR', 'USD')).toBe(true);
  });

  it('treats a missing/invalid base as EUR', () => {
    expect(isForeignCurrency('USD', '')).toBe(true);
    expect(isForeignCurrency('EUR', '')).toBe(false);
  });
});

describe('convertToBase', () => {
  it('multiplies and rounds to cents', () => {
    expect(convertToBase(88, 0.92)).toBe(80.96);
    expect(convertToBase(10, 1.0834)).toBe(10.83); // 10.834 -> 10.83
    expect(convertToBase(3, 0.3333)).toBe(1); // 0.9999 -> 1.00
  });

  it('returns 0 for a missing or non-positive rate rather than inventing 1:1', () => {
    expect(convertToBase(88, 0)).toBe(0);
    expect(convertToBase(88, -1)).toBe(0);
    expect(convertToBase(88, NaN)).toBe(0);
  });

  it('handles a zero amount', () => {
    expect(convertToBase(0, 0.92)).toBe(0);
  });
});

describe('deriveFxRate', () => {
  it('backs out the rate from printed and charged amounts', () => {
    expect(deriveFxRate(88, 81.2)).toBe(0.922727);
    expect(deriveFxRate(100, 92)).toBe(0.92);
  });

  it('is the inverse of convertToBase within a cent', () => {
    const rate = deriveFxRate(88, 81.2);
    expect(convertToBase(88, rate)).toBeCloseTo(81.2, 2);
  });

  it('returns 0 when either side is missing or non-positive', () => {
    expect(deriveFxRate(0, 81.2)).toBe(0);
    expect(deriveFxRate(88, 0)).toBe(0);
    expect(deriveFxRate(-88, 81.2)).toBe(0);
    expect(deriveFxRate(88, NaN)).toBe(0);
  });
});

describe('resolveFx', () => {
  it('passes a base-currency entry straight through (single-currency deployments unchanged)', () => {
    expect(resolveFx({ amount: 88 }, 'EUR')).toEqual({
      amount: 88, currency: 'EUR', origAmount: 0, fxRate: 0, needsRate: false,
    });
    expect(resolveFx({ amount: 88, currency: 'EUR', fxRate: 0 }, 'EUR')).toEqual({
      amount: 88, currency: 'EUR', origAmount: 0, fxRate: 0, needsRate: false,
    });
  });

  it('ignores a stray rate on a base-currency entry', () => {
    expect(resolveFx({ amount: 88, currency: 'EUR', fxRate: 0.92 }, 'EUR').amount).toBe(88);
    expect(resolveFx({ amount: 88, currency: 'EUR', fxRate: 0.92 }, 'EUR').fxRate).toBe(0);
  });

  it('converts a foreign entry with a known rate and keeps the printed amount', () => {
    expect(resolveFx({ amount: 88, currency: 'usd', fxRate: 0.92 }, 'EUR')).toEqual({
      amount: 80.96, currency: 'USD', origAmount: 88, fxRate: 0.92, needsRate: false,
    });
  });

  it('flags a foreign entry with no rate and leaves the amount untouched', () => {
    // Today's behaviour preserved on purpose: no silent 1:1 conversion, no silent zero.
    expect(resolveFx({ amount: 88, currency: 'USD' }, 'EUR')).toEqual({
      amount: 88, currency: 'USD', origAmount: 88, fxRate: 0, needsRate: true,
    });
    expect(resolveFx({ amount: 88, currency: 'USD', fxRate: -2 }, 'EUR').needsRate).toBe(true);
  });

  it('normalizes a non-EUR base', () => {
    expect(resolveFx({ amount: 100, currency: 'EUR', fxRate: 1.08 }, 'usd')).toEqual({
      amount: 108, currency: 'EUR', origAmount: 100, fxRate: 1.08, needsRate: false,
    });
    expect(resolveFx({ amount: 100, currency: 'USD' }, 'usd').origAmount).toBe(0);
  });

  it('coerces a missing or junk amount to 0', () => {
    expect(resolveFx({ amount: NaN }, 'EUR').amount).toBe(0);
    expect(resolveFx({ amount: NaN, currency: 'USD', fxRate: 0.92 }, 'EUR').amount).toBe(0);
  });

  it('is idempotent when re-applied to its own output amount', () => {
    // The edit form re-submits the PRINTED amount, so a second pass must not double-convert.
    const first = resolveFx({ amount: 88, currency: 'USD', fxRate: 0.92 }, 'EUR');
    const second = resolveFx({ amount: first.origAmount, currency: first.currency, fxRate: first.fxRate }, 'EUR');
    expect(second).toEqual(first);
  });
});

describe('formatMoney', () => {
  it('prefixes the right symbol and always shows 2dp', () => {
    expect(formatMoney(88, 'USD')).toBe('$88.00');
    expect(formatMoney(88.5, 'EUR')).toBe('€88.50');
    expect(formatMoney(1234.5, 'GBP')).toBe('£1,234.50');
  });

  it('falls back to the bare code for an unknown currency', () => {
    expect(formatMoney(10, 'XYZ')).toBe('XYZ 10.00');
  });

  it('treats junk amounts as zero', () => {
    expect(formatMoney(NaN, 'USD')).toBe('$0.00');
  });
});

describe('fxBadgeLabel', () => {
  it('is empty when there is nothing foreign to show', () => {
    expect(fxBadgeLabel({ currency: 'EUR', origAmount: 0, fxRate: 0 }, 'EUR')).toBe('');
    expect(fxBadgeLabel({}, 'EUR')).toBe('');
    // Foreign code but no printed amount recorded (legacy row) -> nothing useful to render.
    expect(fxBadgeLabel({ currency: 'USD', origAmount: 0 }, 'EUR')).toBe('');
  });

  it('shows printed amount and rate', () => {
    expect(fxBadgeLabel({ currency: 'USD', origAmount: 88, fxRate: 0.92 }, 'EUR')).toBe('$88.00 @ 0.92');
  });

  it('trims trailing zeros but keeps small-rate precision', () => {
    expect(fxBadgeLabel({ currency: 'USD', origAmount: 88, fxRate: 0.92 }, 'EUR')).toContain('@ 0.92');
    expect(fxBadgeLabel({ currency: 'JPY', origAmount: 1000, fxRate: 0.005812 }, 'EUR')).toContain('@ 0.005812');
  });

  it('omits the rate when it is still unknown', () => {
    expect(fxBadgeLabel({ currency: 'USD', origAmount: 88, fxRate: 0 }, 'EUR')).toBe('$88.00');
  });
});
