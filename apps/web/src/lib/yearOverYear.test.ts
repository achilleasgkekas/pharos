import { describe, expect, it } from 'vitest';
import { buildYearOverYear, shiftYear } from './yearOverYear';

// Fixed reference: 10 August 2026. Every expectation below is written against this
// date so a run in a different month cannot flip a result.
const NOW = new Date(2026, 7, 10);

function m(entries: Record<string, number>): Map<string, number> {
  return new Map(Object.entries(entries));
}

describe('shiftYear', () => {
  it('moves a month key back a whole year, keeping the month', () => {
    expect(shiftYear('2026-01', -1)).toBe('2025-01');
    expect(shiftYear('2026-12', -1)).toBe('2025-12');
  });

  it('moves forward too', () => {
    expect(shiftYear('2025-07', 1)).toBe('2026-07');
  });

  it('leaves a malformed key untouched instead of producing NaN', () => {
    expect(shiftYear('', -1)).toBe('');
    expect(shiftYear('2026-7', -1)).toBe('2026-7');
  });
});

describe('buildYearOverYear (P69)', () => {
  it('compares each complete month against the same month a year earlier', () => {
    const yoy = buildYearOverYear(m({ '2026-07': 120, '2025-07': 100 }), { now: NOW, months: 12 });
    const july = yoy.rows.find((r) => r.key === '2026-07');
    expect(july).toEqual({ key: '2026-07', prevKey: '2025-07', current: 120, previous: 100, delta: 20, pct: 20 });
  });

  it('EXCLUDES the current (partial) month — a part month vs a whole one would lie', () => {
    const yoy = buildYearOverYear(m({ '2026-08': 5, '2025-08': 900 }), { now: NOW, months: 12 });
    expect(yoy.rows.some((r) => r.key === '2026-08')).toBe(false);
    // ...and the August pair contributes nothing, so nothing is comparable here.
    expect(yoy.comparable).toBe(0);
    expect(yoy.headline).toBeNull();
  });

  it('spans exactly `months` complete months, oldest first', () => {
    const yoy = buildYearOverYear(m({}), { now: NOW, months: 12 });
    expect(yoy.rows).toHaveLength(12);
    expect(yoy.rows[0].key).toBe('2025-08');
    expect(yoy.rows[11].key).toBe('2026-07');
  });

  it('honours a 6 and a 24 month window (the Reports selector)', () => {
    expect(buildYearOverYear(m({}), { now: NOW, months: 6 }).rows.map((r) => r.key)).toEqual([
      '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07',
    ]);
    const wide = buildYearOverYear(m({}), { now: NOW, months: 24 });
    expect(wide.rows).toHaveLength(24);
    expect(wide.rows[0].key).toBe('2024-08');
  });

  it('crosses the year boundary correctly (December → previous December)', () => {
    const yoy = buildYearOverYear(m({ '2025-12': 400, '2024-12': 500 }), { now: new Date(2026, 0, 15), months: 12 });
    const dec = yoy.rows.find((r) => r.key === '2025-12');
    expect(dec?.prevKey).toBe('2024-12');
    expect(dec?.delta).toBe(-100);
    expect(dec?.pct).toBe(-20);
  });

  it('reports null (never ∞ or +100%) when last year has nothing tracked', () => {
    const yoy = buildYearOverYear(m({ '2026-07': 300 }), { now: NOW, months: 12 });
    const july = yoy.rows.find((r) => r.key === '2026-07');
    expect(july?.previous).toBe(0);
    expect(july?.pct).toBeNull();
    expect(july?.delta).toBe(300);
  });

  it('does report a real drop to zero as -100%', () => {
    const yoy = buildYearOverYear(m({ '2025-07': 250 }), { now: NOW, months: 12 });
    const july = yoy.rows.find((r) => r.key === '2026-07');
    expect(july?.pct).toBe(-100);
  });

  it('counts only rows with a prior-year figure as comparable', () => {
    const yoy = buildYearOverYear(
      m({ '2026-07': 100, '2025-07': 90, '2026-05': 80, '2025-05': 70, '2026-03': 60 }),
      { now: NOW, months: 12 },
    );
    expect(yoy.comparable).toBe(2);
  });

  it('picks the most RECENT comparable month as the headline', () => {
    const yoy = buildYearOverYear(
      m({ '2026-06': 210, '2025-06': 200, '2026-04': 50, '2025-04': 100 }),
      { now: NOW, months: 12 },
    );
    expect(yoy.headline?.key).toBe('2026-06');
    expect(yoy.headline?.pct).toBe(5);
  });

  it('leaves comparable at 0 when there is under a year of history (card stays hidden)', () => {
    const yoy = buildYearOverYear(m({ '2026-07': 100, '2026-06': 120, '2026-05': 90 }), { now: NOW, months: 12 });
    expect(yoy.comparable).toBe(0);
    expect(yoy.headline).toBeNull();
    expect(yoy.rows).toHaveLength(12); // rows still exist, the caller decides to hide
  });

  it('rounds to whole units and clamps a negative total to zero', () => {
    const yoy = buildYearOverYear(m({ '2026-07': 100.4, '2025-07': -30 }), { now: NOW, months: 12 });
    const july = yoy.rows.find((r) => r.key === '2026-07');
    expect(july?.current).toBe(100);
    expect(july?.previous).toBe(0);
  });

  it('never returns fewer than one month, even for a nonsense window', () => {
    expect(buildYearOverYear(m({}), { now: NOW, months: 0 }).rows).toHaveLength(1);
    expect(buildYearOverYear(m({}), { now: NOW, months: -5 }).rows).toHaveLength(1);
  });
});
