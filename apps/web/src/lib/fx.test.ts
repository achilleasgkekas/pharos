import { describe, it, expect } from 'vitest';
import {
  normalizeCurrency,
  isForeignCurrency,
  convertToBase,
  deriveFxRate,
  resolveFx,
  formatMoney,
  fxBadgeLabel,
  needsFxRate,
  sumBase,
  toPrinted,
  resolveItemPrices,
  resolveStatementAmounts,
  resolveReceiptAmounts,
  effectiveCurrency,
  sameCurrency,
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
    expect(formatMoney(10, 'XYZ')).toBe('XYZ\u00a010.00');
  });

  it('treats junk amounts as zero', () => {
    expect(formatMoney(NaN, 'USD')).toBe('$0.00');
  });
});

describe('needsFxRate', () => {
  it('flags a foreign record whose rate was never filled in', () => {
    expect(needsFxRate({ currency: 'USD', origAmount: 88, fxRate: 0 }, 'EUR')).toBe(true);
    expect(needsFxRate({ currency: 'USD', origAmount: 88 }, 'EUR')).toBe(true);
    expect(needsFxRate({ currency: 'USD', origAmount: 88, fxRate: null }, 'EUR')).toBe(true);
  });

  it('is false once a rate exists', () => {
    expect(needsFxRate({ currency: 'USD', origAmount: 88, fxRate: 0.92 }, 'EUR')).toBe(false);
  });

  it('is false for base-currency records, including pre-P9 rows with a defaulted code', () => {
    expect(needsFxRate({ currency: 'EUR', origAmount: 0, fxRate: 0 }, 'EUR')).toBe(false);
    expect(needsFxRate({}, 'EUR')).toBe(false);
  });

  it('is false for a foreign code with no printed amount recorded', () => {
    // Nothing to convert and nothing to show — same carve-out as fxBadgeLabel.
    expect(needsFxRate({ currency: 'USD', origAmount: 0, fxRate: 0 }, 'EUR')).toBe(false);
  });

  it('follows the deployment base, not EUR', () => {
    expect(needsFxRate({ currency: 'EUR', origAmount: 88, fxRate: 0 }, 'USD')).toBe(true);
    expect(needsFxRate({ currency: 'USD', origAmount: 88, fxRate: 0 }, 'USD')).toBe(false);
  });

  it('agrees with resolveFx: what resolveFx flags is what a stored doc reports', () => {
    const stored = resolveFx({ amount: 88, currency: 'USD', fxRate: 0 }, 'EUR');
    expect(stored.needsRate).toBe(true);
    expect(needsFxRate(stored, 'EUR')).toBe(true);
    const fixed = resolveFx({ amount: 88, currency: 'USD', fxRate: 0.92 }, 'EUR');
    expect(fixed.needsRate).toBe(false);
    expect(needsFxRate(fixed, 'EUR')).toBe(false);
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

describe('resolveStatementAmounts', () => {
  const eur = (i: Parameters<typeof resolveStatementAmounts>[0]) => resolveStatementAmounts(i, 'EUR');

  it('passes a base-currency statement straight through, untouched', () => {
    const r = eur({ totalAmount: 245.9, minimumPayment: 20, paidAmount: 100, txAmounts: [39.47, 25.25] });
    expect(r).toEqual({
      currency: 'EUR',
      origAmount: 0,
      fxRate: 0,
      totalAmount: 245.9,
      minimumPayment: 20,
      paidAmount: 100,
      txAmounts: [39.47, 25.25],
    });
  });

  it('converts the WHOLE document with one rate — total, minimum, paid and every charge', () => {
    const r = eur({ totalAmount: 200, minimumPayment: 20, paidAmount: 50, txAmounts: [100, 60, 40], currency: 'USD', fxRate: 0.9 });
    expect(r.totalAmount).toBe(180);
    expect(r.minimumPayment).toBe(18);
    expect(r.paidAmount).toBe(45);
    // The charges must still add up to the converted total; a half-converted statement
    // would leave computeInstallmentPlans summing foreign amounts into base-currency payoffs.
    expect(r.txAmounts).toEqual([90, 54, 36]);
    expect(r.txAmounts.reduce((a, b) => a + b, 0)).toBe(r.totalAmount);
  });

  it('remembers the printed HEADLINE total in origAmount', () => {
    const r = eur({ totalAmount: 200, currency: 'USD', fxRate: 0.9 });
    expect(r.origAmount).toBe(200);
    expect(r.currency).toBe('USD');
    expect(r.fxRate).toBe(0.9);
  });

  it('never guesses 1:1 — an unknown rate keeps every printed number and flags nothing converted', () => {
    const r = eur({ totalAmount: 200, minimumPayment: 20, paidAmount: 50, txAmounts: [100, 100], currency: 'USD', fxRate: 0 });
    expect(r.totalAmount).toBe(200);
    expect(r.minimumPayment).toBe(20);
    expect(r.paidAmount).toBe(50);
    expect(r.txAmounts).toEqual([100, 100]);
    expect(r.fxRate).toBe(0);
    expect(r.origAmount).toBe(200); // still remembered, so the UI can ask for a rate
  });

  it('treats missing optional figures as 0 and an absent transaction list as empty', () => {
    const r = eur({ totalAmount: 100, currency: 'USD', fxRate: 0.9 });
    expect(r.minimumPayment).toBe(0);
    expect(r.paidAmount).toBe(0);
    expect(r.txAmounts).toEqual([]);
  });

  it('handles a credit balance (negative total) without flipping its sign', () => {
    const r = eur({ totalAmount: -120, txAmounts: [-120], currency: 'USD', fxRate: 0.9 });
    expect(r.totalAmount).toBe(-108);
    expect(r.txAmounts).toEqual([-108]);
  });

  it('rounds every converted field to cents', () => {
    const r = eur({ totalAmount: 33.33, minimumPayment: 3.33, txAmounts: [11.11], currency: 'USD', fxRate: 0.923456 });
    expect(r.totalAmount).toBe(30.78);
    expect(r.minimumPayment).toBe(3.08);
    expect(r.txAmounts).toEqual([10.26]);
  });

  it('honours a non-EUR base currency', () => {
    const r = resolveStatementAmounts({ totalAmount: 50, txAmounts: [50], currency: 'USD', fxRate: 1.1 }, 'USD');
    // Same code as base = not foreign, whatever the rate says.
    expect(r.fxRate).toBe(0);
    expect(r.totalAmount).toBe(50);
    expect(r.txAmounts).toEqual([50]);
    expect(r.currency).toBe('USD');
  });

  it('round-trips with toPrinted, so re-saving an unchanged statement is stable', () => {
    const stored = eur({ totalAmount: 200, minimumPayment: 20, paidAmount: 50, txAmounts: [100, 100], currency: 'USD', fxRate: 0.9 });
    // What the edit form seeds itself with (origAmount for the headline, toPrinted for the
    // rest), then submits unchanged — plus the charges un-converted out of the DB.
    const again = eur({
      totalAmount: stored.origAmount,
      minimumPayment: toPrinted(stored.minimumPayment, stored.fxRate),
      paidAmount: toPrinted(stored.paidAmount, stored.fxRate),
      txAmounts: stored.txAmounts.map((v) => toPrinted(v, stored.fxRate)),
      currency: stored.currency,
      fxRate: stored.fxRate,
    });
    expect(again).toEqual(stored);
  });
});

describe('resolveReceiptAmounts', () => {
  const eur = (i: Parameters<typeof resolveReceiptAmounts>[0]) => resolveReceiptAmounts(i, 'EUR');

  it('passes a base-currency receipt straight through, untouched', () => {
    const r = eur({ total: 193.39, subtotal: 155.96, vatAmount: 37.43, linePrices: [40, 115.96] });
    expect(r).toEqual({
      currency: 'EUR',
      origAmount: 0,
      fxRate: 0,
      total: 193.39,
      subtotal: 155.96,
      vatAmount: 37.43,
      linePrices: [40, 115.96],
    });
  });

  it('converts the WHOLE receipt with one rate — total, net, VAT and every line price', () => {
    const r = eur({ total: 200, subtotal: 160, vatAmount: 40, linePrices: [100, 60], currency: 'USD', fxRate: 0.9 });
    expect(r.total).toBe(180);
    // /reports sums vatAmount and "add items to inventory" copies line prices into
    // Item.purchasedPrice, so leaving either printed would poison a base-currency figure.
    expect(r.subtotal).toBe(144);
    expect(r.vatAmount).toBe(36);
    expect(r.linePrices).toEqual([90, 54]);
    expect(r.subtotal + r.vatAmount).toBe(r.total);
  });

  it('remembers the printed HEADLINE total in origAmount', () => {
    const r = eur({ total: 200, currency: 'USD', fxRate: 0.9 });
    expect(r).toMatchObject({ origAmount: 200, currency: 'USD', fxRate: 0.9 });
  });

  it('never guesses 1:1 — an unknown rate keeps every printed number', () => {
    const r = eur({ total: 200, subtotal: 160, vatAmount: 40, linePrices: [100, 60], currency: 'USD', fxRate: 0 });
    expect(r.total).toBe(200);
    expect(r.subtotal).toBe(160);
    expect(r.vatAmount).toBe(40);
    expect(r.linePrices).toEqual([100, 60]);
    expect(r.fxRate).toBe(0);
    expect(r.origAmount).toBe(200); // still remembered, so the UI can ask for a rate
  });

  it('treats missing secondary figures as 0 and an absent line list as empty', () => {
    const r = eur({ total: 100, currency: 'USD', fxRate: 0.9 });
    expect(r.subtotal).toBe(0);
    expect(r.vatAmount).toBe(0);
    expect(r.linePrices).toEqual([]);
  });

  it('rounds every converted field to cents', () => {
    const r = eur({ total: 33.33, subtotal: 26.88, vatAmount: 6.45, linePrices: [11.11], currency: 'USD', fxRate: 0.923456 });
    expect(r.total).toBe(30.78);
    expect(r.subtotal).toBe(24.82);
    expect(r.vatAmount).toBe(5.96);
    expect(r.linePrices).toEqual([10.26]);
  });

  it('honours a non-EUR base currency', () => {
    const r = resolveReceiptAmounts({ total: 50, subtotal: 50, linePrices: [50], currency: 'USD', fxRate: 1.1 }, 'USD');
    // Same code as base = not foreign, whatever the rate says.
    expect(r).toMatchObject({ currency: 'USD', fxRate: 0, total: 50, subtotal: 50 });
    expect(r.linePrices).toEqual([50]);
  });

  it('round-trips with toPrinted, so re-saving an unchanged receipt is stable', () => {
    const stored = eur({ total: 200, subtotal: 160, vatAmount: 40, linePrices: [100, 60], currency: 'USD', fxRate: 0.9 });
    // What an edit form seeds itself with (origAmount for the headline, toPrinted for the rest).
    const again = eur({
      total: stored.origAmount,
      subtotal: toPrinted(stored.subtotal, stored.fxRate),
      vatAmount: toPrinted(stored.vatAmount, stored.fxRate),
      linePrices: stored.linePrices.map((v) => toPrinted(v, stored.fxRate)),
      currency: stored.currency,
      fxRate: stored.fxRate,
    });
    expect(again).toEqual(stored);
  });
});

describe('effectiveCurrency / sameCurrency (P9 — comparing a quote to a record)', () => {
  it('reads a blank/junk code as the base currency', () => {
    expect(effectiveCurrency('', 'EUR')).toBe('EUR');
    expect(effectiveCurrency(null, 'USD')).toBe('USD');
    expect(effectiveCurrency('EURO', 'GBP')).toBe('GBP');
  });

  it('keeps a declared code, whatever its casing', () => {
    expect(effectiveCurrency('usd', 'EUR')).toBe('USD');
  });

  it('falls back to EUR when the deployment itself has no valid base', () => {
    expect(effectiveCurrency('', '')).toBe('EUR');
  });

  it('treats "blank" and "the base code" as the same money', () => {
    expect(sameCurrency('', 'EUR', 'EUR')).toBe(true);
    expect(sameCurrency('EUR', '', 'EUR')).toBe(true);
    expect(sameCurrency('', '', 'EUR')).toBe(true);
  });

  it('separates a foreign quote from a base-currency record', () => {
    expect(sameCurrency('USD', '', 'EUR')).toBe(false);
    expect(sameCurrency('USD', 'EUR', 'EUR')).toBe(false);
  });

  it('matches two records in the same foreign currency', () => {
    expect(sameCurrency('USD', 'usd', 'EUR')).toBe(true);
  });

  it('is base-relative: the same pair flips when the deployment currency does', () => {
    // A dollar quote is foreign to a EUR deployment and native to a USD one.
    expect(sameCurrency('USD', '', 'EUR')).toBe(false);
    expect(sameCurrency('USD', '', 'USD')).toBe(true);
  });
});

describe('sumBase (#297)', () => {
  it('sums base-currency and converted entries, and leaves out the ones still needing a rate', () => {
    const docs = [
      { amount: 20, currency: 'EUR', origAmount: 0, fxRate: 0 },   // base
      { amount: 92, currency: 'USD', origAmount: 100, fxRate: 0.92 }, // converted
      { amount: 10000, currency: 'JPY', origAmount: 10000, fxRate: 0 }, // printed yen, no rate
      { amount: 5.5 },                                             // pre-P9 row
    ];
    expect(sumBase(docs, 'EUR')).toEqual({ total: 117.5, needsRate: 1 });
  });

  it('counts nothing as missing for a single-currency list', () => {
    expect(sumBase([{ amount: 0.1 }, { amount: 0.2 }], 'EUR')).toEqual({ total: 0.3, needsRate: 0 });
    expect(sumBase([], 'EUR')).toEqual({ total: 0, needsRate: 0 });
  });
});
