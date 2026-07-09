import { describe, expect, it } from 'vitest';
import { netWorthOf, currentPeriod } from './netWorth';

// lib/netWorth.ts — the DB-free half of the net-worth time-series (PA2):
// net = assets (owned inventory + manual accounts) − liabilities (remaining
// installments + outstanding card balances), snapshotted once per YYYY-MM period.

describe('netWorthOf', () => {
  const base = { accounts: {} };
  it('adds assets and subtracts both liability buckets', () => {
    expect(netWorthOf({ ...base, assetsInventory: 10000, assetsAccounts: 5000, liabInstallments: 1200, liabCards: 300 })).toBe(13500);
  });
  it('can go negative (more owed than owned)', () => {
    expect(netWorthOf({ ...base, assetsInventory: 100, assetsAccounts: 0, liabInstallments: 900, liabCards: 50 })).toBe(-850);
  });
  it('rounds to whole units like the rest of the reports page', () => {
    expect(netWorthOf({ ...base, assetsInventory: 100.4, assetsAccounts: 0.2, liabInstallments: 0, liabCards: 0 })).toBe(101);
  });
});

describe('currentPeriod', () => {
  it('formats YYYY-MM with zero-padded month', () => {
    expect(currentPeriod(new Date(2026, 0, 15))).toBe('2026-01');
    expect(currentPeriod(new Date(2026, 11, 1))).toBe('2026-12');
  });
});
