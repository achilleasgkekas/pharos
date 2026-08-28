import { describe, it, expect } from 'vitest';
import { sweepNote, isMonthKey, sweptForMonth, sweepableLeftover, SWEEP_NOTE_PREFIX } from './budgetSweep';

// lib/budgetSweep.ts (P83) — the pure glue between P25's unspent envelope and P12's
// goal contributions. Everything here is deterministic and DB-free; the server action
// (app/reports/goalsActions.ts → sweepBudgetLeftoverToGoal) reuses the SAME helpers, so
// what the button offers and what the action stores can never disagree.

describe('sweepNote', () => {
  it('builds the exact, human-readable note the guard later matches on', () => {
    expect(sweepNote('groceries', '2026-08')).toBe('Budget sweep · groceries · 2026-08');
    expect(sweepNote('groceries', '2026-08').startsWith(SWEEP_NOTE_PREFIX)).toBe(true);
  });

  it('trims, so a stray space in the category cannot fork a category into two notes', () => {
    expect(sweepNote('  groceries ', ' 2026-08 ')).toBe(sweepNote('groceries', '2026-08'));
  });
});

describe('isMonthKey', () => {
  it('accepts YYYY-MM and rejects anything else', () => {
    expect(isMonthKey('2026-08')).toBe(true);
    expect(isMonthKey('2026-12')).toBe(true);
    expect(isMonthKey('2026-00')).toBe(false);
    expect(isMonthKey('2026-13')).toBe(false);
    expect(isMonthKey('2026-8')).toBe(false);
    expect(isMonthKey('2026-08-01')).toBe(false);
    expect(isMonthKey('')).toBe(false);
  });
});

describe('sweptForMonth', () => {
  const contributions = [
    { amount: 100, note: 'birthday money' },
    { amount: 60, note: 'Budget sweep · groceries · 2026-08' },
    { amount: 25, note: 'Budget sweep · groceries · 2026-07' },
    { amount: 40, note: 'Budget sweep · transport · 2026-08' },
  ];

  it('sums only the sweeps of that exact category AND month', () => {
    expect(sweptForMonth(contributions, 'groceries', '2026-08')).toBe(60);
    expect(sweptForMonth(contributions, 'groceries', '2026-07')).toBe(25);
    expect(sweptForMonth(contributions, 'transport', '2026-08')).toBe(40);
  });

  it('is zero for a category/month never swept, and ignores manual contributions', () => {
    expect(sweptForMonth(contributions, 'utilities', '2026-08')).toBe(0);
    expect(sweptForMonth([{ amount: 500, note: 'birthday money' }], 'groceries', '2026-08')).toBe(0);
    expect(sweptForMonth([], 'groceries', '2026-08')).toBe(0);
  });

  it('adds up repeated sweeps of the same month and skips junk amounts', () => {
    const note = sweepNote('groceries', '2026-08');
    expect(
      sweptForMonth(
        [{ amount: 10, note }, { amount: 5.5, note }, { amount: 0, note }, { note }, { amount: Number.NaN, note }],
        'groceries',
        '2026-08'
      )
    ).toBe(15.5);
  });
});

describe('sweepableLeftover', () => {
  it('offers the unspent part of the envelope, in whole euro', () => {
    expect(sweepableLeftover(400, 340)).toBe(60);
    expect(sweepableLeftover(400.4, 339.6)).toBe(60); // both ends rounded like the budget card
  });

  it('offers nothing when the category is exactly on, or over, its limit', () => {
    expect(sweepableLeftover(400, 400)).toBe(0);
    expect(sweepableLeftover(400, 512)).toBe(0);
  });

  it('offers nothing once the month was already swept — one sweep per category+month', () => {
    expect(sweepableLeftover(400, 340, 60)).toBe(0);
    expect(sweepableLeftover(400, 340, 5)).toBe(0); // even a partial earlier sweep closes the month
  });

  it('offers nothing for an empty or missing envelope', () => {
    expect(sweepableLeftover(0, 0)).toBe(0);
    expect(sweepableLeftover(Number.NaN, 20)).toBe(0);
  });
});
