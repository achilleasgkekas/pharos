import { describe, it, expect } from 'vitest';
import { projectMonthEnd, isOverPace, paceMeaningful } from './budgetPace';

describe('projectMonthEnd', () => {
  it('extrapolates linearly from spend-so-far', () => {
    // €100 by day 10 of a 30-day month → ~€300 projected.
    expect(projectMonthEnd(100, 10, 30)).toBe(300);
    // €50 by day 5 of 31 → ~€310.
    expect(projectMonthEnd(50, 5, 31)).toBe(310);
  });

  it('rounds to whole units', () => {
    expect(projectMonthEnd(100, 7, 30)).toBe(429); // 100/7*30 = 428.57 → 429
  });

  it('returns the actual on or past the last day (nothing left to extrapolate)', () => {
    expect(projectMonthEnd(200, 30, 30)).toBe(200);
    expect(projectMonthEnd(200, 31, 30)).toBe(200);
  });

  it('guards day 0 / zero-length month', () => {
    expect(projectMonthEnd(200, 0, 30)).toBe(200);
    expect(projectMonthEnd(200, 10, 0)).toBe(200);
  });

  it('projects 0 when nothing has been spent', () => {
    expect(projectMonthEnd(0, 10, 30)).toBe(0);
  });
});

describe('isOverPace', () => {
  it('flags a projection above the limit', () => {
    expect(isOverPace(300, 250)).toBe(true);
    expect(isOverPace(200, 250)).toBe(false);
  });
  it('is never over when the limit is 0 (no budget set)', () => {
    expect(isOverPace(300, 0)).toBe(false);
  });
});

describe('paceMeaningful', () => {
  it('is true mid-month once something is spent', () => {
    expect(paceMeaningful(50, 10, 30)).toBe(true);
  });
  it('is false with zero spend, on the last day, or before day 1', () => {
    expect(paceMeaningful(0, 10, 30)).toBe(false);
    expect(paceMeaningful(50, 30, 30)).toBe(false);
    expect(paceMeaningful(50, 0, 30)).toBe(false);
  });
});
