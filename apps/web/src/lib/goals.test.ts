import { describe, it, expect } from 'vitest';
import { goalCurrent, goalProgress } from './goals';

const DAY = 86400000;
const NOW = Date.parse('2026-07-15T12:00:00Z');
const iso = (offsetDays: number) => new Date(NOW + offsetDays * DAY).toISOString();

describe('goalCurrent', () => {
  it('sums contributions', () => {
    expect(goalCurrent({ targetAmount: 100, contributions: [{ amount: 30 }, { amount: 20 }] })).toBe(50);
  });
  it('is 0 with no contributions', () => {
    expect(goalCurrent({ targetAmount: 100 })).toBe(0);
    expect(goalCurrent({ targetAmount: 100, contributions: [] })).toBe(0);
  });
  it('floors at 0 (never negative even if a correction entry overshoots)', () => {
    expect(goalCurrent({ targetAmount: 100, contributions: [{ amount: 10 }, { amount: -30 }] })).toBe(0);
  });
});

describe('goalProgress', () => {
  it('computes remaining and pct', () => {
    const p = goalProgress({ targetAmount: 200, contributions: [{ amount: 50 }] }, NOW);
    expect(p.current).toBe(50);
    expect(p.remaining).toBe(150);
    expect(p.pct).toBe(25);
    expect(p.done).toBe(false);
  });
  it('caps pct at 100 and flags done when target reached or exceeded', () => {
    const p = goalProgress({ targetAmount: 100, contributions: [{ amount: 130 }] }, NOW);
    expect(p.pct).toBe(100);
    expect(p.remaining).toBe(0);
    expect(p.done).toBe(true);
  });
  it('target 0 → 0% and not done (avoids divide-by-zero)', () => {
    const p = goalProgress({ targetAmount: 0, contributions: [{ amount: 10 }] }, NOW);
    expect(p.pct).toBe(0);
    expect(p.done).toBe(false);
  });
  it('no targetDate → monthsLeft/perMonth are null', () => {
    const p = goalProgress({ targetAmount: 100 }, NOW);
    expect(p.monthsLeft).toBeNull();
    expect(p.perMonth).toBeNull();
  });
  it('computes monthly amount needed toward a future deadline', () => {
    // ~3 months out, €300 remaining → ~€100/mo
    const p = goalProgress({ targetAmount: 300, targetDate: iso(91), contributions: [] }, NOW);
    expect(p.monthsLeft).toBeCloseTo(3, 0);
    expect(p.perMonth).toBeCloseTo(100, 0);
  });
  it('past deadline (overdue) → perMonth is the full remaining amount now', () => {
    const p = goalProgress({ targetAmount: 100, targetDate: iso(-10), contributions: [{ amount: 40 }] }, NOW);
    expect(p.monthsLeft).toBe(0);
    expect(p.perMonth).toBe(60);
  });
  it('done goal has perMonth null even with a deadline', () => {
    const p = goalProgress({ targetAmount: 100, targetDate: iso(30), contributions: [{ amount: 100 }] }, NOW);
    expect(p.done).toBe(true);
    expect(p.perMonth).toBeNull();
  });
});
