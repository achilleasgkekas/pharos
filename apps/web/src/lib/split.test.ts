import { describe, it, expect } from 'vitest';
import { equalSplit, splitTotals, computeBalances, totalOwed, type SplitEntry } from './split';

describe('equalSplit', () => {
  it('divides evenly among others when it splits clean', () => {
    const s = equalSplit(30, ['Anna', 'Bob'], false);
    expect(s).toEqual([
      { name: 'Anna', share: 15, settled: false },
      { name: 'Bob', share: 15, settled: false },
    ]);
  });

  it('distributes leftover cents so shares sum exactly to the total (no self)', () => {
    const s = equalSplit(10, ['A', 'B', 'C'], false);
    const sum = s.reduce((t, e) => t + e.share, 0);
    expect(Math.round(sum * 100)).toBe(1000);
    // first entry eats the leftover cent
    expect(s[0].share).toBe(3.34);
    expect(s[1].share).toBe(3.33);
    expect(s[2].share).toBe(3.33);
  });

  it('includeSelf: each other pays floor share, you absorb the remainder', () => {
    const s = equalSplit(100, ['A', 'B'], true); // 3 parts of 33.33, you keep 33.34
    expect(s).toEqual([
      { name: 'A', share: 33.33, settled: false },
      { name: 'B', share: 33.33, settled: false },
    ]);
    const others = s.reduce((t, e) => t + e.share, 0);
    expect(Math.round((100 - others) * 100)).toBe(3334); // your implicit share
  });

  it('trims and drops empty names', () => {
    const s = equalSplit(20, [' Anna ', '', '   ', 'Bob'], false);
    expect(s.map((e) => e.name)).toEqual(['Anna', 'Bob']);
    expect(s.every((e) => e.share === 10)).toBe(true);
  });

  it('returns [] for no names', () => {
    expect(equalSplit(50, [], false)).toEqual([]);
    expect(equalSplit(50, ['  '], true)).toEqual([]);
  });

  it('handles zero / negative totals gracefully', () => {
    expect(equalSplit(0, ['A', 'B'], false)).toEqual([
      { name: 'A', share: 0, settled: false },
      { name: 'B', share: 0, settled: false },
    ]);
    expect(equalSplit(-10, ['A'], false)).toEqual([{ name: 'A', share: 0, settled: false }]);
  });
});

describe('splitTotals', () => {
  it('separates owed from settled', () => {
    const split: SplitEntry[] = [
      { name: 'A', share: 10, settled: false },
      { name: 'B', share: 15, settled: true },
      { name: 'C', share: 5, settled: false },
    ];
    expect(splitTotals(split)).toEqual({ owed: 15, settled: 15, count: 3 });
  });

  it('empty split', () => {
    expect(splitTotals()).toEqual({ owed: 0, settled: 0, count: 0 });
    expect(splitTotals([])).toEqual({ owed: 0, settled: 0, count: 0 });
  });
});

describe('computeBalances', () => {
  it('aggregates a person across expenses, case-insensitively', () => {
    const expenses = [
      { split: [{ name: 'Anna', share: 10, settled: false }, { name: 'Bob', share: 10, settled: false }] },
      { split: [{ name: 'anna', share: 5, settled: true }, { name: 'Bob', share: 20, settled: false }] },
    ];
    const bal = computeBalances(expenses);
    // Bob owes 30 (largest first), Anna owes 10 with 5 settled
    expect(bal).toEqual([
      { name: 'Bob', owed: 30, settled: 0, entries: 2 },
      { name: 'Anna', owed: 10, settled: 5, entries: 2 },
    ]);
  });

  it('ignores empty names and missing split arrays', () => {
    const bal = computeBalances([
      { split: [{ name: '  ', share: 99, settled: false }] },
      { split: null },
      {},
    ]);
    expect(bal).toEqual([]);
  });
});

describe('totalOwed', () => {
  it('sums outstanding debt across everyone', () => {
    const expenses = [
      { split: [{ name: 'A', share: 10, settled: false }] },
      { split: [{ name: 'B', share: 15, settled: false }, { name: 'C', share: 5, settled: true }] },
    ];
    expect(totalOwed(expenses)).toBe(25);
  });
});
