import { describe, it, expect } from 'vitest';
import {
  normalizeCurrency,
  isForeignCurrency,
  convertToBase,
  deriveFxRate,
  resolveFx,
  formatMoney,
  fxBadgeLabel,
  toPrinted,
  resolveItemPrices,
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

describe('toPrinted', () => {
  it('divides a stored base amount back to the printed one', () => {
    expect(toPrinted(80.96, 0.92)).toBe(88);
    expect(toPrinted(73.6, 0.92)).toBe(80);
  });

  it('passes the amount through untouched when no rate converted it', () => {
    // rate 0 = not foreign, or foreign-with-no-rate: nothing was converted, so nothing
    // is un-converted either. Returning 0 here would blank out real amounts in the form.
    expect(toPrinted(88, 0)).toBe(88);
    expect(toPrinted(88, -1)).toBe(88);
    expect(toPrinted(88, NaN)).toBe(88);
  });

  it('round-trips with convertToBase to the cent', () => {
    for (const [amount, rate] of [[80.96, 0.92], [123.45, 1.17], [10, 0.008512]] as const) {
      expect(convertToBase(toPrinted(amount, rate), rate)).toBeCloseTo(amount, 2);
    }
  });

  it('handles a zero amount and junk input', () => {
    expect(toPrinted(0, 0.92)).toBe(0);
    expect(toPrinted(NaN, 0.92)).toBe(0);
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

describe('resolveItemPrices (P9 — Items)', () => {
  const eur = (i: Parameters<typeof resolveItemPrices>[0]) => resolveItemPrices(i, 'EUR');

  it('passes a base-currency item straight through, storing no FX metadata', () => {
    const r = eur({ currentPrice: 475, purchasedPrice: null, targetPrice: 400, currency: 'EUR', fxRate: 0 });
    expect(r).toEqual({
      currency: 'EUR', origAmount: 0, fxRate: 0,
      currentPrice: 475, purchasedPrice: null, targetPrice: 400,
    });
  });

  it('treats a blank currency as base currency (single-currency form submits nothing)', () => {
    const r = eur({ currentPrice: 99, purchasedPrice: null, targetPrice: null });
    expect(r.currency).toBe('EUR');
    expect(r.fxRate).toBe(0);
    expect(r.currentPrice).toBe(99);
  });

  it('converts ALL THREE price fields with the one rate', () => {
    const r = eur({ currentPrice: 100, purchasedPrice: 88, targetPrice: 80, currency: 'USD', fxRate: 0.92 });
    expect(r.purchasedPrice).toBe(80.96); // 88 * 0.92
    expect(r.currentPrice).toBe(92);      // 100 * 0.92
    expect(r.targetPrice).toBe(73.6);     // 80 * 0.92
    expect(r.currency).toBe('USD');
    expect(r.fxRate).toBe(0.92);
  });

  it('anchors origAmount on what was PAID when the item is owned', () => {
    const r = eur({ currentPrice: 100, purchasedPrice: 88, targetPrice: null, currency: 'USD', fxRate: 0.92 });
    expect(r.origAmount).toBe(88);
  });

  it('anchors origAmount on the asking price when nothing was paid (wishlist)', () => {
    const r = eur({ currentPrice: 100, purchasedPrice: null, targetPrice: null, currency: 'USD', fxRate: 0.92 });
    expect(r.origAmount).toBe(100);
  });

  it('ignores a zero purchasedPrice as an anchor (never anchors on 0)', () => {
    const r = eur({ currentPrice: 100, purchasedPrice: 0, targetPrice: null, currency: 'USD', fxRate: 0.92 });
    expect(r.origAmount).toBe(100);
  });

  it('never guesses 1:1 — an unknown rate keeps the printed numbers and flags them', () => {
    const r = eur({ currentPrice: 100, purchasedPrice: 88, targetPrice: 80, currency: 'USD', fxRate: 0 });
    // Nothing converted: exactly today's behaviour, so no stored total silently shifts.
    expect(r.currentPrice).toBe(100);
    expect(r.purchasedPrice).toBe(88);
    expect(r.targetPrice).toBe(80);
    expect(r.fxRate).toBe(0);
    expect(r.origAmount).toBe(88); // still remembered, so the UI can ask for a rate
  });

  it('keeps nulls null rather than turning them into 0', () => {
    const r = eur({ currentPrice: 100, purchasedPrice: null, targetPrice: null, currency: 'USD', fxRate: 0.92 });
    expect(r.purchasedPrice).toBeNull();
    expect(r.targetPrice).toBeNull();
  });

  it('rounds every converted field to cents', () => {
    const r = eur({ currentPrice: 33.33, purchasedPrice: null, targetPrice: null, currency: 'USD', fxRate: 0.923456 });
    expect(r.currentPrice).toBe(30.78);
  });

  it('honours a non-EUR base currency', () => {
    const r = resolveItemPrices({ currentPrice: 50, purchasedPrice: null, targetPrice: null, currency: 'USD', fxRate: 1.1 }, 'USD');
    // Same code as base = not foreign, whatever the rate says.
    expect(r.fxRate).toBe(0);
    expect(r.currentPrice).toBe(50);
    expect(r.currency).toBe('USD');
  });

  it('round-trips with toPrinted, so re-saving an unchanged item is stable', () => {
    const stored = eur({ currentPrice: 100, purchasedPrice: 88, targetPrice: null, currency: 'USD', fxRate: 0.92 });
    // What the edit form seeds itself with, then submits unchanged.
    const again = eur({
      currentPrice: toPrinted(stored.currentPrice, stored.fxRate),
      purchasedPrice: toPrinted(stored.purchasedPrice as number, stored.fxRate),
      targetPrice: null,
      currency: stored.currency,
      fxRate: stored.fxRate,
    });
    expect(again.currentPrice).toBe(stored.currentPrice);
    expect(again.purchasedPrice).toBe(stored.purchasedPrice);
    expect(again.origAmount).toBe(88);
  });
});
