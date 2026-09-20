import { describe, it, expect } from 'vitest';
import { detectPriceHikes, type HikeEntry } from './priceHike';

function e(
  vendorKey: string,
  amount: number,
  date: string,
  extra: Partial<HikeEntry> = {},
): HikeEntry {
  return { vendorKey, vendor: vendorKey, amount, date, recurring: true, ...extra };
}

describe('detectPriceHikes', () => {
  it('returns [] for empty / nullish input', () => {
    expect(detectPriceHikes(undefined)).toEqual([]);
    expect(detectPriceHikes(null)).toEqual([]);
    expect(detectPriceHikes([])).toEqual([]);
  });

  it('flags a recurring subscription hike above the percent threshold', () => {
    const hikes = detectPriceHikes([
      e('netflix', 13, '2026-05-01'),
      e('netflix', 15, '2026-06-01'),
    ]);
    expect(hikes).toHaveLength(1);
    expect(hikes[0]).toMatchObject({
      vendorKey: 'netflix',
      prev: 13,
      curr: 15,
      deltaAbs: 2,
      deltaPct: 15,
      direction: 'up',
    });
  });

  it('compares only the two most recent charges', () => {
    const hikes = detectPriceHikes([
      e('dei', 40, '2026-03-01'),
      e('dei', 50, '2026-04-01'),
      e('dei', 59, '2026-05-01'),
    ]);
    expect(hikes).toHaveLength(1);
    expect(hikes[0]).toMatchObject({ prev: 50, curr: 59, deltaPct: 18, direction: 'up' });
  });

  it('reports decreases too (possible mis-charge)', () => {
    const hikes = detectPriceHikes([
      e('ote', 62, '2026-04-01'),
      e('ote', 29, '2026-06-01'),
    ]);
    expect(hikes).toHaveLength(1);
    expect(hikes[0].direction).toBe('down');
    expect(hikes[0].deltaAbs).toBe(-33);
    expect(hikes[0].deltaPct).toBeLessThan(0);
  });

  it('ignores unchanged / sub-threshold charges (5% OR €1 default)', () => {
    // +0.8% and €0.50 → below both thresholds.
    expect(detectPriceHikes([e('x', 62, '2026-04-01'), e('x', 62.5, '2026-05-01')])).toEqual([]);
    // identical (recurring-auto duplicate) → no event.
    expect(detectPriceHikes([e('y', 20, '2026-04-01'), e('y', 20, '2026-05-01')])).toEqual([]);
  });

  it('fires on the €1 absolute threshold even when the percent is tiny', () => {
    // 200 → 202 = 1% (< 5%) but €2 (≥ €1) → fires via absolute rule.
    const hikes = detectPriceHikes([e('rent', 200, '2026-04-01'), e('rent', 202, '2026-05-01')]);
    expect(hikes).toHaveLength(1);
    expect(hikes[0].deltaAbs).toBe(2);
  });

  it('does not watch a short non-recurring series (needs ≥3 entries)', () => {
    const two = [
      e('shop', 10, '2026-04-01', { recurring: false }),
      e('shop', 30, '2026-05-01', { recurring: false }),
    ];
    expect(detectPriceHikes(two)).toEqual([]);
    // A third entry qualifies the non-recurring series; latest two are compared.
    const three = [...two, e('shop', 60, '2026-06-01', { recurring: false })];
    expect(detectPriceHikes(three)).toHaveLength(1);
    expect(detectPriceHikes(three)[0]).toMatchObject({ prev: 30, curr: 60 });
  });

  it('skips income rows, empty keys and non-positive amounts', () => {
    expect(
      detectPriceHikes([
        e('sal', 1000, '2026-04-01', { kind: 'income' }),
        e('sal', 1200, '2026-05-01', { kind: 'income' }),
      ]),
    ).toEqual([]);
    expect(detectPriceHikes([e('', 10, '2026-04-01'), e('', 20, '2026-05-01')])).toEqual([]);
    expect(detectPriceHikes([e('z', 0, '2026-04-01'), e('z', 20, '2026-05-01')])).toEqual([]);
  });

  it('ignores rows with unparseable dates', () => {
    const hikes = detectPriceHikes([
      e('w', 10, 'not-a-date'),
      e('w', 20, '2026-05-01'),
      e('w', 40, '2026-06-01'),
    ]);
    // Only the two valid-date charges (20 → 40) are compared.
    expect(hikes).toHaveLength(1);
    expect(hikes[0]).toMatchObject({ prev: 20, curr: 40 });
  });

  it('sorts multiple series most-recent change first', () => {
    const hikes = detectPriceHikes([
      e('a', 10, '2026-01-01'),
      e('a', 20, '2026-02-01'),
      e('b', 10, '2026-05-01'),
      e('b', 20, '2026-06-01'),
    ]);
    expect(hikes.map((h) => h.vendorKey)).toEqual(['b', 'a']);
  });

  it('honours custom thresholds', () => {
    const rows = [e('c', 100, '2026-04-01'), e('c', 108, '2026-05-01')]; // +8%
    expect(detectPriceHikes(rows, { minPct: 10, minAbs: 20 })).toEqual([]);
    expect(detectPriceHikes(rows, { minPct: 5, minAbs: 20 })).toHaveLength(1);
  });

  it('uses origAmount when present to avoid FX rate fluctuation false positives', () => {
    // $10 USD billed monthly, base EUR amount fluctuates due to exchange rate changes (€9.10 -> €9.60).
    const fxFluctuating = [
      e('vps', 9.1, '2026-04-01', { origAmount: 10 }),
      e('vps', 9.6, '2026-05-01', { origAmount: 10 }),
    ];
    // Since origAmount is constant (10 -> 10), no hike alert should fire.
    expect(detectPriceHikes(fxFluctuating)).toEqual([]);

    // Actual price hike in foreign currency ($10 USD -> $12 USD)
    const actualHike = [
      e('vps', 9.1, '2026-04-01', { origAmount: 10 }),
      e('vps', 11.2, '2026-05-01', { origAmount: 12 }),
    ];
    const hikes = detectPriceHikes(actualHike);
    expect(hikes).toHaveLength(1);
    expect(hikes[0]).toMatchObject({
      vendorKey: 'vps',
      prev: 10,
      curr: 12,
      deltaAbs: 2,
      deltaPct: 20,
      direction: 'up',
    });
  });
});
