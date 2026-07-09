import { describe, it, expect } from 'vitest';
import { suggestBudgetsFromExpenses, type BudgetExpenseRow } from './budgetSuggest';

// Fixed reference "now" so the trailing-window math is deterministic. now = July
// 2026 → the current month (2026-07) is excluded; a windowMonths=3 window is
// {2026-04, 2026-05, 2026-06}.
const NOW = new Date(2026, 6, 15); // month index 6 = July

function e(category: string, amount: number, period: string, kind = 'expense'): BudgetExpenseRow {
  return { category, amount, period, kind };
}

describe('suggestBudgetsFromExpenses', () => {
  it('returns {} for empty / nullish input', () => {
    expect(suggestBudgetsFromExpenses(undefined, { now: NOW })).toEqual({});
    expect(suggestBudgetsFromExpenses(null, { now: NOW })).toEqual({});
    expect(suggestBudgetsFromExpenses([], { now: NOW })).toEqual({});
  });

  it('takes the median of monthly totals per category, rounded to nearest €5', () => {
    const rows = [
      e('utilities', 60, '2026-04'),
      e('utilities', 62, '2026-05'),
      e('utilities', 100, '2026-06'), // median of [60,62,100] = 62 → 60
    ];
    expect(suggestBudgetsFromExpenses(rows, { now: NOW })).toEqual({ utilities: 60 });
  });

  it('sums multiple entries within the same month before taking the median', () => {
    const rows = [
      e('food', 20, '2026-04'),
      e('food', 30, '2026-04'), // April total = 50
      e('food', 70, '2026-05'), // May total = 70; median of [50,70] = 60
    ];
    expect(suggestBudgetsFromExpenses(rows, { now: NOW })).toEqual({ food: 60 });
  });

  it('skips categories with fewer than minMonths months of data', () => {
    const rows = [
      e('rare', 500, '2026-05'), // only one month → skipped (default minMonths=2)
      e('utilities', 40, '2026-04'),
      e('utilities', 40, '2026-06'),
    ];
    expect(suggestBudgetsFromExpenses(rows, { now: NOW })).toEqual({ utilities: 40 });
  });

  it('excludes the current partial month and months outside the window', () => {
    const rows = [
      e('utilities', 40, '2026-06'),
      e('utilities', 40, '2026-05'),
      e('utilities', 9999, '2026-07'), // current month → excluded
      e('utilities', 9999, '2026-01'), // outside 3-month window → excluded
    ];
    expect(suggestBudgetsFromExpenses(rows, { now: NOW })).toEqual({ utilities: 40 });
  });

  it('ignores income rows and non-positive amounts', () => {
    const rows = [
      e('salary', 2000, '2026-04', 'income'),
      e('salary', 2000, '2026-05', 'income'),
      e('food', 0, '2026-04'),
      e('food', -50, '2026-05'),
      e('food', 45, '2026-04'),
      e('food', 55, '2026-05'),
    ];
    // salary is income → skipped; the 0/-50 food rows ignored; median of [45,55] = 50.
    expect(suggestBudgetsFromExpenses(rows, { now: NOW })).toEqual({ food: 50 });
  });

  it('buckets by date when period is absent', () => {
    const rows: BudgetExpenseRow[] = [
      { category: 'transport', amount: 30, date: '2026-04-10', kind: 'expense' },
      { category: 'transport', amount: 30, date: new Date(2026, 4, 20), kind: 'expense' },
    ];
    expect(suggestBudgetsFromExpenses(rows, { now: NOW })).toEqual({ transport: 30 });
  });

  it('falls back to "other" for a missing category', () => {
    const rows: BudgetExpenseRow[] = [
      { amount: 20, period: '2026-04', kind: 'expense' },
      { amount: 20, period: '2026-05', kind: 'expense' },
    ];
    expect(suggestBudgetsFromExpenses(rows, { now: NOW })).toEqual({ other: 20 });
  });

  it('drops a category whose rounded suggestion is zero', () => {
    const rows = [
      e('tiny', 1, '2026-04'),
      e('tiny', 1, '2026-05'), // median 1 → rounds to 0 → dropped
    ];
    expect(suggestBudgetsFromExpenses(rows, { now: NOW })).toEqual({});
  });

  it('honours a wider window and custom rounding', () => {
    const rows = [
      e('utilities', 40, '2026-02'),
      e('utilities', 44, '2026-03'),
      e('utilities', 48, '2026-04'), // median [40,44,48] = 44 → nearest 10 = 40
    ];
    expect(suggestBudgetsFromExpenses(rows, { now: NOW, windowMonths: 6, roundTo: 10 })).toEqual({ utilities: 40 });
  });
});
