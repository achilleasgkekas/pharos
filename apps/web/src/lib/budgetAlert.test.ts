import { describe, it, expect } from 'vitest';
import { detectBudgetExceeded, type BudgetAlertRow } from './budgetAlert';

const MK = '2026-07';

function row(category: string, amount: number, date = '2026-07-10', extra: Partial<BudgetAlertRow> = {}): BudgetAlertRow {
  return { category, amount, date, ...extra };
}

describe('detectBudgetExceeded', () => {
  it('returns [] for empty/nullish input', () => {
    expect(detectBudgetExceeded(undefined, undefined, MK)).toEqual([]);
    expect(detectBudgetExceeded([], {}, MK)).toEqual([]);
    expect(detectBudgetExceeded(null, null, MK)).toEqual([]);
  });

  it('flags a category whose this-month spend exceeds its budget', () => {
    const out = detectBudgetExceeded(
      [row('groceries', 80), row('groceries', 60)],
      { groceries: 100 },
      MK,
    );
    expect(out).toEqual([{ category: 'groceries', budget: 100, actual: 140, pct: 140 }]);
  });

  it('does not flag a category still under budget', () => {
    const out = detectBudgetExceeded([row('groceries', 50)], { groceries: 100 }, MK);
    expect(out).toEqual([]);
  });

  it('ignores income rows, other months, and unbudgeted categories', () => {
    const out = detectBudgetExceeded(
      [
        row('groceries', 500, '2026-07-01', { kind: 'income' }), // income, ignored
        row('groceries', 200, '2026-06-15'), // last month, ignored
        row('utilities', 999), // no budget set for it, ignored
        row('groceries', 150), // this one counts
      ],
      { groceries: 100 },
      MK,
    );
    expect(out).toEqual([{ category: 'groceries', budget: 100, actual: 150, pct: 150 }]);
  });

  it('treats a zero or negative budget as unset (never fires)', () => {
    expect(detectBudgetExceeded([row('rent', 900)], { rent: 0 }, MK)).toEqual([]);
    expect(detectBudgetExceeded([row('rent', 900)], { rent: -50 }, MK)).toEqual([]);
  });

  it('sorts multiple exceeded categories worst-first by percent over', () => {
    const out = detectBudgetExceeded(
      [row('a', 105), row('b', 300)],
      { a: 100, b: 200 },
      MK,
    );
    expect(out.map((o) => o.category)).toEqual(['b', 'a']); // 150% before 105%
  });

  it('ignores rows with no category, invalid date, or non-positive amount', () => {
    const out = detectBudgetExceeded(
      [
        { category: '', amount: 500, date: '2026-07-01' },
        { category: 'a', amount: 500, date: 'not-a-date' },
        { category: 'a', amount: 0, date: '2026-07-01' },
        row('a', 150),
      ],
      { a: 100 },
      MK,
    );
    expect(out).toEqual([{ category: 'a', budget: 100, actual: 150, pct: 150 }]);
  });
});
