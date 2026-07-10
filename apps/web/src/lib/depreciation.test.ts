import { describe, it, expect } from 'vitest';
import {
  DEFAULT_DEPRECIATION,
  DEFAULT_DEPRECIATION_RATES,
  resolveDepreciation,
  rateForCategory,
  depreciatedValue,
  estimatedItemValue,
  type DepreciationConfig,
} from './depreciation';

const NOW = new Date(2026, 6, 1); // 1 July 2026
const YEAR_AGO = new Date(2025, 6, 1); // exactly ~1 year earlier
const TWO_YEARS_AGO = new Date(2024, 6, 1);

function cfg(over: Partial<DepreciationConfig> = {}): DepreciationConfig {
  return { ...DEFAULT_DEPRECIATION, rates: { ...DEFAULT_DEPRECIATION_RATES }, ...over };
}

describe('resolveDepreciation', () => {
  it('returns effective defaults for null/empty/garbage input', () => {
    for (const raw of [null, undefined, {}, 42, 'x']) {
      const c = resolveDepreciation(raw);
      expect(c.enabled).toBe(true);
      expect(c.floorPct).toBe(DEFAULT_DEPRECIATION.floorPct);
      expect(c.defaultRate).toBe(DEFAULT_DEPRECIATION.defaultRate);
      expect(c.rates.compute).toBe(DEFAULT_DEPRECIATION_RATES.compute);
    }
  });

  it('only an explicit false disables it', () => {
    expect(resolveDepreciation({ enabled: false }).enabled).toBe(false);
    expect(resolveDepreciation({ enabled: true }).enabled).toBe(true);
    expect(resolveDepreciation({ enabled: 0 }).enabled).toBe(true); // not === false
  });

  it('merges stored per-category rates over the defaults and clamps', () => {
    const c = resolveDepreciation({ rates: { compute: 40, drone: 30, bad: -5, over: 250 } });
    expect(c.rates.compute).toBe(40); // overridden
    expect(c.rates.drone).toBe(30); // custom category kept
    expect(c.rates.audio).toBe(DEFAULT_DEPRECIATION_RATES.audio); // untouched default
    expect(c.rates.bad).toBeUndefined(); // negative rejected
    expect(c.rates.over).toBe(100); // clamped to 100
  });

  it('clamps floorPct and defaultRate to 0..100', () => {
    expect(resolveDepreciation({ floorPct: -10 }).floorPct).toBe(0);
    expect(resolveDepreciation({ floorPct: 500 }).floorPct).toBe(100);
    expect(resolveDepreciation({ defaultRate: 20 }).defaultRate).toBe(20);
    expect(resolveDepreciation({ floorPct: 'x' }).floorPct).toBe(DEFAULT_DEPRECIATION.floorPct);
  });
});

describe('rateForCategory', () => {
  it('uses the explicit rate, else the default rate', () => {
    const c = cfg({ defaultRate: 15 });
    expect(rateForCategory(c, 'compute')).toBe(DEFAULT_DEPRECIATION_RATES.compute);
    expect(rateForCategory(c, 'unknown-cat')).toBe(15);
    expect(rateForCategory(c, null)).toBe(DEFAULT_DEPRECIATION_RATES.other);
    expect(rateForCategory(c, '')).toBe(DEFAULT_DEPRECIATION_RATES.other);
  });
});

describe('depreciatedValue', () => {
  it('declining balance: value = price * (1-rate)^years', () => {
    // compute rate = 25%, 1 year → 1000 * 0.75 = 750
    expect(depreciatedValue(1000, YEAR_AGO, 'compute', cfg(), NOW)).toBeCloseTo(750, 0);
    // 2 years → 1000 * 0.75^2 = 562.5
    expect(depreciatedValue(1000, TWO_YEARS_AGO, 'compute', cfg(), NOW)).toBeCloseTo(562.5, 0);
  });

  it('floors at the salvage fraction of the purchase price', () => {
    // 10 years at 50% would be ~1, but floor is 10% of 1000 = 100
    const v = depreciatedValue(1000, new Date(2016, 6, 1), 'consumable', cfg({ floorPct: 10 }), NOW);
    expect(v).toBe(100);
  });

  it('returns the full price for a same-day or future purchase (no appreciation)', () => {
    expect(depreciatedValue(500, NOW, 'compute', cfg(), NOW)).toBe(500);
    expect(depreciatedValue(500, new Date(2027, 0, 1), 'compute', cfg(), NOW)).toBe(500);
  });

  it('returns the price unchanged when the date is missing or invalid', () => {
    expect(depreciatedValue(300, null, 'compute', cfg(), NOW)).toBe(300);
    expect(depreciatedValue(300, 'not-a-date', 'compute', cfg(), NOW)).toBe(300);
  });

  it('a 0% rate leaves the value at the purchase price', () => {
    expect(depreciatedValue(800, TWO_YEARS_AGO, 'freebie', cfg({ defaultRate: 0 }), NOW)).toBe(800);
  });

  it('returns 0 for a non-positive purchase price', () => {
    expect(depreciatedValue(0, YEAR_AGO, 'compute', cfg(), NOW)).toBe(0);
    expect(depreciatedValue(-5, YEAR_AGO, 'compute', cfg(), NOW)).toBe(0);
  });
});

describe('estimatedItemValue', () => {
  it('when disabled, reproduces the pre-P29 formula (purchasedPrice ?? currentPrice ?? 0)', () => {
    const c = cfg({ enabled: false });
    expect(estimatedItemValue({ purchasedPrice: 900, currentPrice: 500, purchasedAt: TWO_YEARS_AGO, category: 'compute' }, c, NOW)).toBe(900);
    expect(estimatedItemValue({ purchasedPrice: null, currentPrice: 500 }, c, NOW)).toBe(500);
    expect(estimatedItemValue({ purchasedPrice: null, currentPrice: null }, c, NOW)).toBe(0);
  });

  it('depreciates a receipt-seeded item where currentPrice === purchasedPrice (not treated as override)', () => {
    // Receipt import sets both to the same gross unit → should still depreciate.
    const v = estimatedItemValue({ purchasedPrice: 1000, currentPrice: 1000, purchasedAt: YEAR_AGO, category: 'compute' }, cfg(), NOW);
    expect(v).toBeCloseTo(750, 0);
  });

  it('a genuine manual current-value override wins (currentPrice differs from purchase)', () => {
    const v = estimatedItemValue({ purchasedPrice: 1000, currentPrice: 620, purchasedAt: YEAR_AGO, category: 'compute' }, cfg(), NOW);
    expect(v).toBe(620);
  });

  it('depreciates purchasedPrice when currentPrice is 0/unset', () => {
    const v = estimatedItemValue({ purchasedPrice: 1000, currentPrice: 0, purchasedAt: YEAR_AGO, category: 'compute' }, cfg(), NOW);
    expect(v).toBeCloseTo(750, 0);
  });

  it('falls back to available price when there is no purchase price to depreciate', () => {
    // no purchasedPrice → use currentPrice as-is
    expect(estimatedItemValue({ purchasedPrice: null, currentPrice: 300, purchasedAt: YEAR_AGO }, cfg(), NOW)).toBe(300);
    // nothing at all
    expect(estimatedItemValue({}, cfg(), NOW)).toBe(0);
  });
});
