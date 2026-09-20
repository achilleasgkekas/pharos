import { describe, expect, it, vi } from 'vitest';
import { safeDate, safeDateOrNull } from './dates';

// dates.ts parses receipt/statement dates that native `new Date()` mishandles.
// The critical rule: European day-first (DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY) is
// reordered to ISO so a Greek receipt's "03/04/2025" becomes 3 April, not 4 March.
// EU-branch inputs use local midnight (T00:00:00), so getFullYear/getMonth/getDate
// are timezone-stable and safe to assert directly; ISO date-only strings are parsed
// as UTC by V8, so those we compare via getTime() against a reference to stay portable.

const FALLBACK = new Date('2000-01-01T00:00:00Z');

describe('safeDate — European day-first parsing', () => {
  it('parses DD/MM/YYYY as day-first', () => {
    const d = safeDate('23/09/2025', FALLBACK);
    expect(d.getFullYear()).toBe(2025);
    expect(d.getMonth()).toBe(8); // September (0-indexed)
    expect(d.getDate()).toBe(23);
  });

  it('parses DD-MM-YYYY with hyphen separators', () => {
    const d = safeDate('23-09-2025', FALLBACK);
    expect(d.getFullYear()).toBe(2025);
    expect(d.getMonth()).toBe(8);
    expect(d.getDate()).toBe(23);
  });

  it('parses DD.MM.YYYY with dot separators', () => {
    const d = safeDate('23.09.2025', FALLBACK);
    expect(d.getFullYear()).toBe(2025);
    expect(d.getMonth()).toBe(8);
    expect(d.getDate()).toBe(23);
  });

  it('accepts single-digit day and month', () => {
    const d = safeDate('3/4/2025', FALLBACK);
    expect(d.getMonth()).toBe(3); // April
    expect(d.getDate()).toBe(3);
  });

  it('treats the first group as the day even when it exceeds 12', () => {
    // 13/04/2025 could only be day-first; proves it is not read as month-first.
    const d = safeDate('13/04/2025', FALLBACK);
    expect(d.getMonth()).toBe(3); // April
    expect(d.getDate()).toBe(13);
  });

  it('trims surrounding whitespace before parsing', () => {
    const d = safeDate('  23/09/2025  ', FALLBACK);
    expect(d.getFullYear()).toBe(2025);
    expect(d.getMonth()).toBe(8);
    expect(d.getDate()).toBe(23);
  });
});

describe('safeDate — ISO and native fall-through', () => {
  it('parses ISO year-first strings via native Date', () => {
    const d = safeDate('2025-09-23', FALLBACK);
    expect(d.getTime()).toBe(new Date('2025-09-23').getTime());
  });

  it('parses ISO date-time strings', () => {
    const d = safeDate('2025-09-23T14:30:00Z', FALLBACK);
    expect(d.getTime()).toBe(new Date('2025-09-23T14:30:00Z').getTime());
  });

  it('falls through to native parsing when the EU month is out of range', () => {
    // month 13 fails the EU validation; V8 then reads "04/13/2025" as US M/D/Y.
    const d = safeDate('04/13/2025', FALLBACK);
    expect(d.getMonth()).toBe(3); // April
    expect(d.getDate()).toBe(13);
  });
});

describe('safeDate — invalid input returns the fallback', () => {
  it('returns the fallback for a non-date string', () => {
    expect(safeDate('not a date', FALLBACK)).toBe(FALLBACK);
  });

  it('returns the fallback for an empty or whitespace string', () => {
    expect(safeDate('', FALLBACK)).toBe(FALLBACK);
    expect(safeDate('   ', FALLBACK)).toBe(FALLBACK);
  });

  it('returns the fallback for null, undefined and non-string values', () => {
    expect(safeDate(null, FALLBACK)).toBe(FALLBACK);
    expect(safeDate(undefined, FALLBACK)).toBe(FALLBACK);
    expect(safeDate(12345, FALLBACK)).toBe(FALLBACK);
    expect(safeDate({ day: 1 }, FALLBACK)).toBe(FALLBACK);
  });

  it('returns the fallback when the day is out of range and unparseable natively', () => {
    expect(safeDate('32/01/2025', FALLBACK)).toBe(FALLBACK);
    expect(safeDate('13/13/2025', FALLBACK)).toBe(FALLBACK);
  });

  it('defaults the fallback to roughly now when none is supplied', () => {
    const before = Date.now();
    const d = safeDate('garbage');
    const after = Date.now();
    expect(d).toBeInstanceOf(Date);
    expect(d.getTime()).toBeGreaterThanOrEqual(before);
    expect(d.getTime()).toBeLessThanOrEqual(after);
  });
});

describe('safeDateOrNull', () => {
  it('returns a Date for valid European input', () => {
    const d = safeDateOrNull('23/09/2025');
    expect(d).toBeInstanceOf(Date);
    expect(d?.getMonth()).toBe(8);
    expect(d?.getDate()).toBe(23);
  });

  it('returns null for invalid, empty, null and non-string input', () => {
    expect(safeDateOrNull('not a date')).toBeNull();
    expect(safeDateOrNull('')).toBeNull();
    expect(safeDateOrNull(null)).toBeNull();
    expect(safeDateOrNull(undefined)).toBeNull();
    expect(safeDateOrNull(42)).toBeNull();
  });
});

import { todayLocal } from './dates';

describe('todayLocal', () => {
  it('returns the current date formatted as YYYY-MM-DD in the local timezone', () => {
    const d = new Date('2026-09-18T12:00:00Z');
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(d);
    
    const result = todayLocal();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result).toBe(d.toLocaleDateString('en-CA'));
    
    vi.useRealTimers();
  });
});

