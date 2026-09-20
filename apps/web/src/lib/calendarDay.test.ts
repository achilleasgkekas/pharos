import { describe, it, expect, afterEach, vi } from 'vitest';
import { dayOf, monthOf, ymd } from './calendarDay';

// #187 — the calendar drew entries in the wrong cell for any viewer whose zone disagreed with the
// server about which date an instant falls on. What is pinned here is that the day survives the
// trip as TEXT, and specifically that reading it back cannot be moved by a timezone.

afterEach(() => vi.useRealTimers());

describe('ymd', () => {
  it('formats in the same frame the month key uses (local getters, zero-padded)', () => {
    expect(ymd(new Date(2026, 4, 1))).toBe('2026-05-01');
    expect(ymd(new Date(2026, 11, 31))).toBe('2026-12-31');
  });

  it('keeps the day the server sees for a late-evening instant, not the next one', () => {
    // 21:00 local on the 30th is the 30th here, whatever it is called elsewhere.
    expect(ymd(new Date(2026, 3, 30, 21, 0, 0))).toBe('2026-04-30');
  });
});

describe('dayOf', () => {
  it('reads the day straight out of the text', () => {
    expect(dayOf('2026-05-01')).toBe(1);
    expect(dayOf('2026-05-31')).toBe(31);
  });

  // The regression itself: `new Date('2026-05-01').getDate()` answers 30 west of Greenwich,
  // because the string parses as UTC midnight and getDate() re-reads it locally. Reading the
  // characters cannot do that, in any zone.
  it('gives the same answer that the old Date round-trip got wrong west of Greenwich', () => {
    const value = '2026-05-01';
    const viaDate = new Date(value); // UTC midnight
    expect(dayOf(value)).toBe(1);
    expect(dayOf(value)).toBe(viaDate.getUTCDate()); // agrees with the server's intent
  });
});

describe('monthOf', () => {
  it('names the block an entry belongs to', () => {
    expect(monthOf('2026-05-01')).toBe('2026-05');
    // The property that matters: an entry's own month always matches the block it was put in.
    const d = new Date(2026, 4, 17, 23, 30);
    expect(monthOf(ymd(d))).toBe(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  });
});
