import { describe, expect, it } from 'vitest';
import { categoryRollover, ROLLOVER_WINDOW } from './budgetRollover';

describe('categoryRollover (P25 envelope budgeting)', () => {
  it('carries a surplus forward when prior months were under budget', () => {
    // base 100, spent 60 and 70 → carried (40 + 30) = 70, effective 170
    expect(categoryRollover(100, [60, 70])).toEqual({ carried: 70, effective: 170 });
  });

  it('shrinks this month when a prior month overspent', () => {
    // base 100, spent 130 → carried -30, effective 70
    expect(categoryRollover(100, [130])).toEqual({ carried: -30, effective: 70 });
  });

  it('nets surplus and deficit across the window', () => {
    // base 100: -30 (spent 130), +40 (spent 60), 0 (spent 100) → carried 10, effective 110
    expect(categoryRollover(100, [130, 60, 100])).toEqual({ carried: 10, effective: 110 });
  });

  it('floors the effective budget at 0 when the envelope is fully drained', () => {
    // base 100, two months of 300 → carried (100-300)*2 = -400, effective floored at 0
    expect(categoryRollover(100, [300, 300])).toEqual({ carried: -400, effective: 0 });
  });

  it('treats no prior months as no carry (effective == base)', () => {
    expect(categoryRollover(100, [])).toEqual({ carried: 0, effective: 100 });
  });

  it('gives a full base as surplus for a tracked month with zero spend', () => {
    expect(categoryRollover(100, [0])).toEqual({ carried: 100, effective: 200 });
  });

  it('clamps negative spend inputs to zero (no phantom over-carry)', () => {
    expect(categoryRollover(100, [-50])).toEqual({ carried: 100, effective: 200 });
  });

  it('returns no rollover for a zero or negative base', () => {
    expect(categoryRollover(0, [50, 20])).toEqual({ carried: 0, effective: 0 });
    expect(categoryRollover(-10, [50])).toEqual({ carried: 0, effective: 0 });
  });

  it('rounds carried and effective to whole currency units', () => {
    // base 50, spent 33.33 and 41.7 → carried (16.67 + 8.30) = 24.97 → 25, effective 75
    expect(categoryRollover(50, [33.33, 41.7])).toEqual({ carried: 25, effective: 75 });
  });

  it('exposes a sane default window', () => {
    expect(ROLLOVER_WINDOW).toBe(3);
  });
});
