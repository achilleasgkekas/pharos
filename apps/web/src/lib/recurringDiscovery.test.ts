import { describe, it, expect } from 'vitest';
import { discoverRecurringCandidates, type RecurringRow } from './recurringDiscovery';

function e(vendorKey: string, amount: number, date: string, extra: Partial<RecurringRow> = {}): RecurringRow {
  return { vendorKey, vendor: vendorKey, amount, date, ...extra };
}

describe('discoverRecurringCandidates', () => {
  it('returns [] for empty / nullish input', () => {
    expect(discoverRecurringCandidates(undefined)).toEqual([]);
    expect(discoverRecurringCandidates(null)).toEqual([]);
    expect(discoverRecurringCandidates([])).toEqual([]);
  });

  it('flags a monthly-cadence series with >=3 occurrences', () => {
    const out = discoverRecurringCandidates([
      e('netflix', 13, '2026-04-05'),
      e('netflix', 13, '2026-05-05'),
      e('netflix', 15, '2026-06-05'),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      vendorKey: 'netflix',
      cycle: 'monthly',
      occurrences: 3,
      lastAmount: 15,
    });
  });

  it('does not watch a series with fewer than minOccurrences', () => {
    const out = discoverRecurringCandidates([
      e('spotify', 10, '2026-05-01'),
      e('spotify', 10, '2026-06-01'),
    ]);
    expect(out).toEqual([]);
  });

  it('excludes vendorKeys already tracked as a Subscription', () => {
    const rows = [
      e('netflix', 13, '2026-04-05'),
      e('netflix', 13, '2026-05-05'),
      e('netflix', 13, '2026-06-05'),
    ];
    expect(discoverRecurringCandidates(rows, { excludeVendorKeys: ['netflix'] })).toEqual([]);
    expect(discoverRecurringCandidates(rows, { excludeVendorKeys: ['other'] })).toHaveLength(1);
  });

  it('detects weekly and yearly cadences', () => {
    const weekly = discoverRecurringCandidates([
      e('cleaner', 20, '2026-06-01'),
      e('cleaner', 20, '2026-06-08'),
      e('cleaner', 20, '2026-06-15'),
    ]);
    expect(weekly).toHaveLength(1);
    expect(weekly[0].cycle).toBe('weekly');

    const yearly = discoverRecurringCandidates([
      e('domain', 12, '2024-01-10'),
      e('domain', 12, '2025-01-10'),
      e('domain', 14, '2026-01-11'),
    ]);
    expect(yearly).toHaveLength(1);
    expect(yearly[0].cycle).toBe('yearly');
  });

  it('ignores irregular one-off purchases even if the average coincidentally fits a band', () => {
    // Gaps of 5 and 55 days average to ~30 (monthly-ish) but are wildly inconsistent.
    const out = discoverRecurringCandidates([
      e('randomshop', 40, '2026-01-01'),
      e('randomshop', 30, '2026-01-06'),
      e('randomshop', 60, '2026-03-02'),
    ]);
    expect(out).toEqual([]);
  });

  it('skips income rows, empty keys and non-positive amounts', () => {
    expect(
      discoverRecurringCandidates([
        e('sal', 1000, '2026-04-01', { kind: 'income' }),
        e('sal', 1000, '2026-05-01', { kind: 'income' }),
        e('sal', 1000, '2026-06-01', { kind: 'income' }),
      ]),
    ).toEqual([]);
    expect(
      discoverRecurringCandidates([e('', 10, '2026-04-01'), e('', 10, '2026-05-01'), e('', 10, '2026-06-01')]),
    ).toEqual([]);
    expect(
      discoverRecurringCandidates([e('z', 0, '2026-04-01'), e('z', 0, '2026-05-01'), e('z', 0, '2026-06-01')]),
    ).toEqual([]);
  });

  it('ignores rows with unparseable dates', () => {
    const out = discoverRecurringCandidates([
      e('w', 10, 'not-a-date'),
      e('w', 20, '2026-04-01'),
      e('w', 20, '2026-05-01'),
      e('w', 20, '2026-06-01'),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].occurrences).toBe(3);
  });

  it('reports avgAmount, firstDate/lastDate and the most common category', () => {
    const out = discoverRecurringCandidates([
      e('gym', 30, '2026-04-01', { category: 'fitness' }),
      e('gym', 30, '2026-05-01', { category: 'fitness' }),
      e('gym', 30, '2026-06-01', { category: 'other' }),
    ]);
    expect(out[0]).toMatchObject({
      avgAmount: 30,
      firstDate: new Date('2026-04-01').toISOString(),
      lastDate: new Date('2026-06-01').toISOString(),
      category: 'fitness',
    });
  });

  it('sorts multiple series most-recently-charged first', () => {
    const out = discoverRecurringCandidates([
      e('a', 10, '2025-01-01'),
      e('a', 10, '2025-02-01'),
      e('a', 10, '2025-03-01'),
      e('b', 10, '2026-05-01'),
      e('b', 10, '2026-06-01'),
      e('b', 10, '2026-07-01'),
    ]);
    expect(out.map((c) => c.vendorKey)).toEqual(['b', 'a']);
  });

  it('honours custom minOccurrences and toleranceDays', () => {
    const rows = [e('x', 10, '2026-04-01'), e('x', 10, '2026-05-01')];
    expect(discoverRecurringCandidates(rows, { minOccurrences: 2 })).toHaveLength(1);
    // 45-day gap is out of range for monthly even with a generous tolerance of 5.
    const irregular = [e('y', 10, '2026-04-01'), e('y', 10, '2026-05-16'), e('y', 10, '2026-06-30')];
    expect(discoverRecurringCandidates(irregular, { minOccurrences: 2, toleranceDays: 5 })).toEqual([]);
  });
});
