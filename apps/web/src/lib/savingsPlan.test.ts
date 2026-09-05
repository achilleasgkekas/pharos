import { describe, it, expect } from 'vitest';
import {
  monthKeyOf,
  monthTotalsFrom,
  monthLabelOf,
  monthlyBaseline,
  projectBalances,
  balanceOn,
  planForTarget,
  earliestDate,
  coverShortfall,
  BASELINE_WINDOW,
  type MonthTotals,
  type Baseline,
} from './savingsPlan';

// 15 Mar 2026, midday — halfway through a 31-day month, which is what makes the
// prorating of the current month visible in the numbers below.
const NOW = new Date(2026, 2, 15, 12, 0, 0);

const months = (spec: [string, number, number][]): MonthTotals[] =>
  spec.map(([key, income, expense]) => ({ key, income, expense }));

const steady: MonthTotals[] = months([
  ['2025-09', 3000, 2000],
  ['2025-10', 3000, 2000],
  ['2025-11', 3000, 2000],
  ['2025-12', 3000, 2000],
  ['2026-01', 3000, 2000],
  ['2026-02', 3000, 2000],
]);

const BASE_1000: Baseline = { basis: 'history', months: 6, incomeMonths: 6, income: 3000, spend: 2000, net: 1000 };

describe('month keys and labels', () => {
  it('pads the month so keys sort chronologically as strings', () => {
    expect(monthKeyOf(new Date(2026, 8, 1))).toBe('2026-09');
    expect(monthKeyOf(new Date(2026, 11, 1))).toBe('2026-12');
    expect('2026-09' < '2026-12').toBe(true);
  });

  it('labels a month the way the reports charts do', () => {
    expect(monthLabelOf(new Date(2027, 2, 1))).toBe('Mar 27');
  });
});

describe('monthTotalsFrom', () => {
  it('files a row by its period when it has one', () => {
    expect(monthTotalsFrom([{ kind: 'expense', amount: 40, period: '2026-01', date: new Date(2026, 5, 1) }])).toEqual([
      { key: '2026-01', income: 0, expense: 40 },
    ]);
  });

  it('falls back to the date when there is no period', () => {
    expect(monthTotalsFrom([{ kind: 'expense', amount: 40, date: new Date(2026, 5, 9) }])[0].key).toBe('2026-06');
  });

  it('separates income from expense and totals each month', () => {
    const rows = monthTotalsFrom([
      { kind: 'income', amount: 2000, period: '2026-01' },
      { kind: 'expense', amount: 300, period: '2026-01' },
      { kind: 'expense', amount: 200.5, period: '2026-01' },
      { kind: 'expense', amount: 100, period: '2026-02' },
    ]);
    expect(rows).toEqual([
      { key: '2026-01', income: 2000, expense: 500.5 },
      { key: '2026-02', income: 0, expense: 100 },
    ]);
  });

  it('returns months in chronological order across a year boundary', () => {
    const rows = monthTotalsFrom([
      { kind: 'expense', amount: 1, period: '2026-02' },
      { kind: 'expense', amount: 1, period: '2025-12' },
      { kind: 'expense', amount: 1, period: '2026-01' },
    ]);
    expect(rows.map((r) => r.key)).toEqual(['2025-12', '2026-01', '2026-02']);
  });

  it('drops rows it cannot date rather than guessing a month for them', () => {
    expect(monthTotalsFrom([{ kind: 'expense', amount: 40 }])).toEqual([]);
    expect(monthTotalsFrom([{ kind: 'expense', amount: 40, date: 'nonsense' }])).toEqual([]);
    expect(monthTotalsFrom([{ kind: 'expense', amount: 40, period: '26-1' }])).toEqual([]);
  });

  it('ignores rows with no positive amount', () => {
    expect(monthTotalsFrom([{ kind: 'expense', amount: 0, period: '2026-01' }, { kind: 'expense', period: '2026-01' }])).toEqual([]);
  });

  it('treats anything that is not income as spend, the way the ledger does', () => {
    expect(monthTotalsFrom([{ amount: 10, period: '2026-01' }])[0].expense).toBe(10);
  });
});

describe('monthlyBaseline', () => {
  it('measures income, spend and what a normal month leaves over', () => {
    const b = monthlyBaseline(steady, { now: NOW });
    expect(b).toMatchObject({ basis: 'history', months: 6, incomeMonths: 6, income: 3000, spend: 2000, net: 1000 });
  });

  it('ignores the current month, which is only part of a month', () => {
    // March is half over: counting its half-sized figures would drag the baseline down.
    const b = monthlyBaseline([...steady, { key: '2026-03', income: 1500, expense: 900 }], { now: NOW });
    expect(b.months).toBe(6);
    expect(b.income).toBe(3000);
  });

  it('takes the median, so one blowout month does not become the new normal', () => {
    const withHoliday = months([
      ['2025-10', 3000, 2000],
      ['2025-11', 3000, 2000],
      ['2025-12', 3000, 9000], // Christmas
      ['2026-01', 3000, 2000],
      ['2026-02', 3000, 2000],
    ]);
    const b = monthlyBaseline(withHoliday, { now: NOW });
    expect(b.spend).toBe(2000); // a mean would have said 3400
    expect(b.net).toBe(1000);
  });

  it('keeps only the most recent window of months', () => {
    const long = months(
      Array.from({ length: 12 }, (_, i) => [`2025-${String(i + 1).padStart(2, '0')}`, 1000, 500] as [string, number, number])
    );
    expect(monthlyBaseline(long, { now: NOW }).months).toBe(BASELINE_WINDOW);
  });

  it('calls a one- or two-month sample thin rather than dressing it up as a pattern', () => {
    const b = monthlyBaseline(months([['2026-01', 2000, 1500], ['2026-02', 2400, 1500]]), { now: NOW });
    expect(b.basis).toBe('thin');
    expect(b.months).toBe(2);
    expect(b.income).toBe(2200); // the mean: with two points there is no meaningful median
  });

  it('reports how many months actually recorded income, so a sparse ledger shows as sparse', () => {
    const sparse = months([
      ['2025-10', 0, 900],
      ['2025-11', 0, 900],
      ['2025-12', 3000, 900],
      ['2026-01', 0, 900],
      ['2026-02', 0, 900],
    ]);
    const b = monthlyBaseline(sparse, { now: NOW });
    expect(b.incomeMonths).toBe(1);
    expect(b.income).toBe(0); // median of mostly-nothing is nothing; the count says why
    expect(b.net).toBe(-900);
  });

  it('has no basis at all when nothing complete has been recorded', () => {
    expect(monthlyBaseline([], { now: NOW })).toMatchObject({ basis: 'none', months: 0, net: 0 });
    expect(monthlyBaseline(months([['2026-03', 500, 500]]), { now: NOW }).basis).toBe('none');
  });

  it('skips empty months rather than counting them as months of zero spend', () => {
    const gappy = months([['2025-10', 0, 0], ['2026-01', 3000, 2000], ['2026-02', 3000, 2000]]);
    expect(monthlyBaseline(gappy, { now: NOW }).months).toBe(2);
  });
});

describe('projectBalances', () => {
  it('prorates the current month by what is left of it', () => {
    const p = projectBalances({ startBalance: 5000, baseline: BASE_1000, months: 3, now: NOW });
    // 15 Mar midday of a 31-day month → ~53% of March still to come.
    expect(p[0].key).toBe('2026-03');
    expect(p[0].net).toBeGreaterThan(500);
    expect(p[0].net).toBeLessThan(560);
    expect(p[0].openBalance).toBe(5000);
    expect(p[0].balance).toBe(round2(5000 + p[0].net));
  });

  it('runs whole months after the first', () => {
    const p = projectBalances({ startBalance: 5000, baseline: BASE_1000, months: 3, now: NOW });
    expect(p[1]).toMatchObject({ key: '2026-04', income: 3000, spend: 2000, net: 1000 });
    expect(p[2].key).toBe('2026-05');
    expect(p[2].balance).toBe(round2(p[1].balance + 1000));
  });

  it('frees up the money after an obligation makes its last payment', () => {
    // A card instalment with 2 payments left is inside the historic spend for March and
    // April, and inside nothing after that: May onward keeps the €200.
    const p = projectBalances({
      startBalance: 0,
      baseline: BASE_1000,
      obligations: [{ label: 'Laptop', perMonth: 200, monthsRemaining: 2 }],
      months: 4,
      now: NOW,
    });
    expect(p[1]).toMatchObject({ key: '2026-04', spend: 2000, net: 1000 });
    expect(p[2]).toMatchObject({ key: '2026-05', spend: 1800, net: 1200 });
    expect(p[3].net).toBe(1200);
  });

  it('never projects a negative monthly spend, however many obligations end', () => {
    const p = projectBalances({
      startBalance: 0,
      baseline: BASE_1000,
      obligations: [{ label: 'Huge', perMonth: 9000, monthsRemaining: 0 }],
      months: 2,
      now: NOW,
    });
    expect(p[0].spend).toBe(0);
  });

  it('lets the balance fall when a normal month spends more than it earns', () => {
    const sinking: Baseline = { basis: 'history', months: 6, incomeMonths: 6, income: 1000, spend: 1400, net: -400 };
    const p = projectBalances({ startBalance: 1000, baseline: sinking, months: 3, now: NOW });
    expect(p[2].balance).toBeLessThan(0);
  });

  it('returns nothing for a zero-month horizon', () => {
    expect(projectBalances({ startBalance: 10, baseline: BASE_1000, months: 0, now: NOW })).toEqual([]);
  });
});

describe('balanceOn', () => {
  const projection = projectBalances({ startBalance: 5000, baseline: BASE_1000, months: 12, now: NOW });

  it('answers for a day inside a future month, not just for the month', () => {
    const midApril = balanceOn(projection, new Date(2026, 3, 16, 0, 0, 0))!;
    const april = projection[1];
    expect(midApril).toBeGreaterThan(april.openBalance);
    expect(midApril).toBeLessThan(april.balance);
  });

  it('is the opening balance today and for anything before it', () => {
    expect(balanceOn(projection, NOW)).toBe(5000);
    expect(balanceOn(projection, new Date(2020, 0, 1))).toBe(5000);
  });

  it('matches the month close on the last instant of a month', () => {
    expect(balanceOn(projection, new Date(2026, 4, 1, 0, 0, 0))).toBe(projection[1].balance);
  });

  it('is null past the horizon rather than extrapolating silently', () => {
    expect(balanceOn(projection, new Date(2030, 0, 1))).toBeNull();
  });

  it('is null for an unparseable date and for an empty projection', () => {
    expect(balanceOn(projection, 'not a date')).toBeNull();
    expect(balanceOn([], NOW)).toBeNull();
  });
});

describe('planForTarget', () => {
  const projection = projectBalances({ startBalance: 0, baseline: BASE_1000, months: 60, now: NOW });
  const plan = (over: Partial<Parameters<typeof planForTarget>[0]> = {}) =>
    planForTarget({ target: 6000, baseline: BASE_1000, projection, now: NOW, ...over });

  it('prices the deadline per month and calls a comfortable one on track', () => {
    const p = plan({ targetDate: new Date(2027, 2, 15) }); // 12 months for 6000 → 500/mo of 1000 spare
    expect(p.requiredPerMonth).toBeGreaterThan(495);
    expect(p.requiredPerMonth).toBeLessThan(505);
    expect(p.affordablePerMonth).toBe(1000);
    expect(p.verdict).toBe('on-track');
    expect(p.shortfallPerMonth).toBe(0);
    expect(p.suggestedPerMonth).toBe(p.requiredPerMonth);
  });

  it('counts what is already put aside, so the answer is about what is missing', () => {
    const p = plan({ saved: 4500, targetDate: new Date(2027, 2, 15) });
    expect(p.remaining).toBe(1500);
    expect(p.requiredPerMonth).toBeGreaterThan(120);
    expect(p.requiredPerMonth).toBeLessThan(130);
  });

  it('calls a deadline that eats nearly all the spare cash tight, not comfortable', () => {
    const p = plan({ target: 5700, targetDate: new Date(2026, 8, 15) }); // ~950/mo of 1000
    expect(p.verdict).toBe('tight');
  });

  it('says short when the deadline costs more per month than there is, and when it can happen instead', () => {
    const p = plan({ target: 24000, targetDate: new Date(2027, 2, 15) }); // 2000/mo needed, 1000 spare
    expect(p.verdict).toBe('short');
    expect(p.shortfallPerMonth).toBeGreaterThan(995);
    expect(p.shortfallPerMonth).toBeLessThan(1010);
    expect(p.earliest).not.toBeNull();
    // At €1000 a month (March half-priced), 24k lands around mid-2028.
    expect(new Date(p.earliest as string).getFullYear()).toBe(2028);
    expect(p.suggestedPerMonth).toBe(1000); // save what you can rather than nothing
  });

  it('says so plainly when a normal month leaves nothing to save', () => {
    const broke: Baseline = { basis: 'history', months: 6, incomeMonths: 6, income: 1500, spend: 1600, net: -100 };
    const p = planForTarget({ target: 1000, targetDate: new Date(2027, 0, 1), baseline: broke, projection: [], now: NOW });
    expect(p.verdict).toBe('no-surplus');
    expect(p.affordablePerMonth).toBe(0);
    expect(p.earliest).toBeNull();
    expect(p.suggestedPerMonth).toBe(0);
  });

  it('is reached once the contributions cover it, whatever the date says', () => {
    const p = plan({ saved: 6000, targetDate: new Date(2026, 0, 1) });
    expect(p.verdict).toBe('reached');
    expect(p.remaining).toBe(0);
    expect(p.suggestedPerMonth).toBe(0);
  });

  it('is unknown without a deadline, but still says what is affordable', () => {
    const p = plan({ targetDate: null });
    expect(p.verdict).toBe('unknown');
    expect(p.requiredPerMonth).toBeNull();
    expect(p.monthsLeft).toBeNull();
    expect(p.affordablePerMonth).toBe(1000);
    expect(p.earliest).not.toBeNull(); // the projection can still answer "when"
  });

  it('is unknown when there is no history to answer with', () => {
    const p = planForTarget({ target: 500, targetDate: new Date(2027, 0, 1), baseline: monthlyBaseline([], { now: NOW }), now: NOW });
    expect(p.verdict).toBe('unknown');
  });

  it('treats a deadline that has already passed as needing all of it now', () => {
    const p = plan({ targetDate: new Date(2026, 0, 1) });
    expect(p.monthsLeft).toBe(0);
    expect(p.requiredPerMonth).toBe(6000);
    expect(p.verdict).toBe('short');
  });
});

describe('earliestDate', () => {
  it('banks each month of surplus and returns the day the target is met', () => {
    const projection = projectBalances({ startBalance: 0, baseline: BASE_1000, months: 24, now: NOW });
    const iso = earliestDate(2000, projection) as string;
    // ~530 in the rest of March, then 1000 a month: covered during May.
    expect(iso.slice(0, 7)).toBe('2026-05');
  });

  it('sees that an ending instalment makes saving faster', () => {
    // The whole point of projecting instead of dividing: €100 a month spare while the car
    // is being paid off, €500 a month once it is, and a target that lands years earlier.
    const tight: Baseline = { basis: 'history', months: 6, incomeMonths: 6, income: 1200, spend: 1100, net: 100 };
    const withPlan = projectBalances({
      startBalance: 0,
      baseline: tight,
      obligations: [{ label: 'Car', perMonth: 400, monthsRemaining: 2 }],
      months: 36,
      now: NOW,
    });
    const flat = projectBalances({ startBalance: 0, baseline: tight, months: 36, now: NOW });
    const withEnd = new Date(earliestDate(2000, withPlan) as string).getTime();
    const flatEnd = new Date(earliestDate(2000, flat) as string).getTime();
    expect(withEnd).toBeLessThan(flatEnd);
    expect(withEnd).toBeGreaterThan(NOW.getTime());
  });

  it('skips months that leave nothing rather than counting them backwards', () => {
    const lumpy = projectBalances({
      startBalance: 0,
      baseline: { basis: 'history', months: 6, incomeMonths: 6, income: 900, spend: 1000, net: -100 },
      months: 12,
      now: NOW,
    });
    expect(earliestDate(50, lumpy)).toBeNull();
  });

  it('is already met for a target with nothing left to save', () => {
    const projection = projectBalances({ startBalance: 0, baseline: BASE_1000, months: 3, now: NOW });
    expect(earliestDate(0, projection)).toBe(projection[0].start);
  });
});

describe('coverShortfall', () => {
  const subs: { label: string; perMonth: number }[] = [
    { label: 'Netflix', perMonth: 14 },
    { label: 'Gym', perMonth: 40 },
    { label: 'iCloud', perMonth: 3 },
    { label: 'Spotify', perMonth: 11 },
  ];

  it('proposes the dearest first and stops once the gap is closed', () => {
    const c = coverShortfall(45, subs);
    expect(c.picks.map((p) => p.label)).toEqual(['Gym', 'Netflix']);
    expect(c.covered).toBe(54);
    expect(c.closes).toBe(true);
  });

  it('says honestly when everything on the list still does not close it', () => {
    const c = coverShortfall(500, subs);
    expect(c.closes).toBe(false);
    expect(c.covered).toBe(68);
    expect(c.picks).toHaveLength(4);
  });

  it('proposes nothing at all when there is no gap', () => {
    expect(coverShortfall(0, subs)).toEqual({ picks: [], covered: 0, closes: true });
  });

  it('never proposes more entries than the limit', () => {
    expect(coverShortfall(1000, subs, 2).picks).toHaveLength(2);
  });

  it('ignores candidates that cost nothing', () => {
    expect(coverShortfall(10, [{ label: 'Free tier', perMonth: 0 }]).picks).toEqual([]);
  });
});

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
