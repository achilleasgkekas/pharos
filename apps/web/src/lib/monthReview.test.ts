import { describe, it, expect } from 'vitest';
import { buildMonthReview, type MonthReviewRow } from './monthReview';

const MK = '2026-07';

function row(
  category: string,
  amount: number,
  date = '2026-07-10',
  extra: Partial<MonthReviewRow> = {},
): MonthReviewRow {
  return { category, amount, date, ...extra };
}

describe('buildMonthReview', () => {
  it('handles empty/nullish input without throwing', () => {
    const r = buildMonthReview(undefined, { monthKey: MK });
    expect(r.totalSpent).toBe(0);
    expect(r.totalIncome).toBe(0);
    expect(r.pctChange).toBeNull();
    expect(r.topCategory).toBeNull();
    expect(r.overBudget).toEqual([]);
    expect(r.priceChanges).toEqual([]);
    expect(r.warrantiesExpiringSoon).toEqual([]);
    expect(r.narrative).toContain('Nothing unusual to flag');
  });

  it('sums this-month spend/income and computes net', () => {
    const r = buildMonthReview(
      [row('groceries', 100), row('rent', 400), { amount: 900, date: '2026-07-01', kind: 'income' }],
      { monthKey: MK },
    );
    expect(r.totalSpent).toBe(500);
    expect(r.totalIncome).toBe(900);
    expect(r.net).toBe(400);
    expect(r.narrative).toContain('€500');
    expect(r.narrative).toContain('€900 income');
  });

  it('ignores rows outside the target month for totals', () => {
    const r = buildMonthReview([row('groceries', 100, '2026-06-15'), row('groceries', 50, '2026-08-01')], {
      monthKey: MK,
    });
    expect(r.totalSpent).toBe(0);
  });

  it('picks the top category by this-month spend', () => {
    const r = buildMonthReview([row('groceries', 60), row('utilities', 200), row('groceries', 30)], {
      monthKey: MK,
    });
    expect(r.topCategory).toEqual({ name: 'utilities', amount: 200 });
  });

  it('computes pctChange vs the previous month, null with no prior data', () => {
    const withPrior = buildMonthReview(
      [row('groceries', 150, '2026-07-05'), row('groceries', 100, '2026-06-05')],
      { monthKey: MK },
    );
    expect(withPrior.prevMonthSpent).toBe(100);
    expect(withPrior.pctChange).toBe(50);

    const noPrior = buildMonthReview([row('groceries', 150)], { monthKey: MK });
    expect(noPrior.pctChange).toBeNull();
  });

  it('resolves the previous month across a year boundary', () => {
    const r = buildMonthReview(
      [row('rent', 500, '2026-01-10'), row('rent', 400, '2025-12-10')],
      { monthKey: '2026-01' },
    );
    expect(r.prevMonthSpent).toBe(400);
    expect(r.pctChange).toBe(25);
  });

  it('surfaces over-budget categories via the shared budget-exceeded detector', () => {
    const r = buildMonthReview([row('groceries', 150)], { monthKey: MK, budgets: { groceries: 100 } });
    expect(r.overBudget).toEqual([{ category: 'groceries', budget: 100, actual: 150, pct: 150 }]);
    expect(r.narrative).toContain('Over budget: groceries');
  });

  it('surfaces recurring price changes dated within the target month', () => {
    const r = buildMonthReview(
      [
        row('subs', 13, '2026-06-01', { vendor: 'Netflix', vendorKey: 'netflix', recurring: true }),
        row('subs', 15, '2026-07-01', { vendor: 'Netflix', vendorKey: 'netflix', recurring: true }),
      ],
      { monthKey: MK },
    );
    expect(r.priceChanges).toHaveLength(1);
    expect(r.priceChanges[0]).toMatchObject({ vendor: 'Netflix', direction: 'up', deltaPct: 15 });
    expect(r.narrative).toContain('Netflix +15%');
  });

  it('excludes a price change whose latest charge falls outside the target month', () => {
    const r = buildMonthReview(
      [
        row('subs', 13, '2026-05-01', { vendor: 'Netflix', vendorKey: 'netflix', recurring: true }),
        row('subs', 15, '2026-06-01', { vendor: 'Netflix', vendorKey: 'netflix', recurring: true }),
      ],
      { monthKey: MK }, // review month is July; the hike landed in June
    );
    expect(r.priceChanges).toEqual([]);
  });

  it('surfaces warranties expiring within the window, sorted soonest-first', () => {
    const now = new Date('2026-07-15T00:00:00Z');
    const r = buildMonthReview([], {
      monthKey: MK,
      now,
      warrantyWindowDays: 90,
      warranties: [
        { title: 'Far away', warrantyUntil: '2027-01-01' }, // >90d, excluded
        { title: 'Soon', warrantyUntil: '2026-08-01' },
        { title: 'Soonest', warrantyUntil: '2026-07-20' },
        { title: 'Already expired', warrantyUntil: '2026-01-01' }, // excluded
      ],
    });
    expect(r.warrantiesExpiringSoon.map((w) => w.title)).toEqual(['Soonest', 'Soon']);
    expect(r.narrative).toContain('2 warranties expiring within 90 days');
  });

  it('produces a "nothing unusual" narrative when nothing is flagged', () => {
    const r = buildMonthReview([row('groceries', 50)], { monthKey: MK });
    expect(r.overBudget).toEqual([]);
    expect(r.priceChanges).toEqual([]);
    expect(r.warrantiesExpiringSoon).toEqual([]);
    expect(r.narrative).toContain('Nothing unusual to flag');
  });
});
