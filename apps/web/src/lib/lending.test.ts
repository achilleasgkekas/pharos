import { describe, it, expect } from 'vitest';
import {
  LENDING_STATUSES,
  MAX_BORROWER_LENGTH,
  lendingApplies,
  normalizeBorrower,
  isLentOut,
  lendingDaysUntilReturn,
  lendingState,
  lendingDaysOut,
} from './lending';

const DAY = 86400000;
const NOW = Date.parse('2026-09-05T12:00:00Z');
const iso = (offsetDays: number) => new Date(NOW + offsetDays * DAY).toISOString();

describe('lendingApplies', () => {
  it('covers only the two owned-and-intact statuses', () => {
    expect(LENDING_STATUSES).toEqual(['received', 'installed']);
    expect(lendingApplies('received')).toBe(true);
    expect(lendingApplies('installed')).toBe(true);
    for (const s of ['researching', 'decided', 'ordered', 'deferred', 'sold', 'broken']) {
      expect(lendingApplies(s)).toBe(false);
    }
  });
  it('is false for a missing status rather than throwing', () => {
    expect(lendingApplies(null)).toBe(false);
    expect(lendingApplies(undefined)).toBe(false);
  });
});

describe('normalizeBorrower', () => {
  it('trims, and treats blank or whitespace as "at home"', () => {
    expect(normalizeBorrower('  Nikos ')).toBe('Nikos');
    expect(normalizeBorrower('')).toBe('');
    expect(normalizeBorrower('   ')).toBe('');
  });
  it('is empty for anything that is not a string', () => {
    expect(normalizeBorrower(null)).toBe('');
    expect(normalizeBorrower(undefined)).toBe('');
    expect(normalizeBorrower(42)).toBe('');
  });
  it('caps a pasted essay to a storable name', () => {
    expect(normalizeBorrower('x'.repeat(500))).toHaveLength(MAX_BORROWER_LENGTH);
  });
});

describe('isLentOut', () => {
  it('is true only when an owned item names a borrower', () => {
    expect(isLentOut('received', 'Nikos')).toBe(true);
    expect(isLentOut('installed', 'Maria')).toBe(true);
  });
  it('is false with no borrower, which is every pre-P47 item', () => {
    expect(isLentOut('received', '')).toBe(false);
    expect(isLentOut('received', '   ')).toBe(false);
    expect(isLentOut('received', null)).toBe(false);
  });
  it('is false once the item is sold or broken, even with a stale name', () => {
    expect(isLentOut('sold', 'Nikos')).toBe(false);
    expect(isLentOut('broken', 'Nikos')).toBe(false);
    expect(isLentOut('ordered', 'Nikos')).toBe(false);
  });
});

describe('lendingDaysUntilReturn', () => {
  it('counts whole days to the agreed date, negative once it has passed', () => {
    expect(lendingDaysUntilReturn('received', 'Nikos', iso(5), NOW)).toBe(5);
    expect(lendingDaysUntilReturn('received', 'Nikos', iso(-2), NOW)).toBe(-2);
  });
  it('is null for an open-ended loan: no deadline means never late', () => {
    expect(lendingDaysUntilReturn('received', 'Nikos', null, NOW)).toBeNull();
    expect(lendingDaysUntilReturn('received', 'Nikos', '', NOW)).toBeNull();
  });
  it('is null when the item is home or no longer owned', () => {
    expect(lendingDaysUntilReturn('received', '', iso(-9), NOW)).toBeNull();
    expect(lendingDaysUntilReturn('sold', 'Nikos', iso(-9), NOW)).toBeNull();
  });
  it('is null on an unparseable date instead of NaN days', () => {
    expect(lendingDaysUntilReturn('received', 'Nikos', 'not-a-date', NOW)).toBeNull();
  });
});

describe('lendingState', () => {
  it('grades a deadline as overdue, due-soon or ok', () => {
    expect(lendingState('received', 'Nikos', iso(-1), NOW)).toBe('overdue');
    expect(lendingState('received', 'Nikos', iso(2), NOW)).toBe('due-soon');
    expect(lendingState('received', 'Nikos', iso(30), NOW)).toBe('ok');
  });
  it('uses a 3-day window by default, and honours an override', () => {
    expect(lendingState('received', 'Nikos', iso(4), NOW)).toBe('ok');
    expect(lendingState('received', 'Nikos', iso(4), NOW, 7)).toBe('due-soon');
  });
  it('is null with no loan and with no deadline', () => {
    expect(lendingState('received', '', iso(-1), NOW)).toBeNull();
    expect(lendingState('received', 'Nikos', null, NOW)).toBeNull();
  });
});

describe('lendingDaysOut', () => {
  it('counts whole days since the thing was handed over', () => {
    expect(lendingDaysOut('received', 'Nikos', iso(-10), NOW)).toBe(10);
  });
  it('never goes negative on a lend date typed in the future', () => {
    expect(lendingDaysOut('received', 'Nikos', iso(3), NOW)).toBe(0);
  });
  it('is null when the item is home, or the lend date was never recorded', () => {
    expect(lendingDaysOut('received', '', iso(-10), NOW)).toBeNull();
    expect(lendingDaysOut('received', 'Nikos', null, NOW)).toBeNull();
    expect(lendingDaysOut('received', 'Nikos', 'nonsense', NOW)).toBeNull();
  });
});
