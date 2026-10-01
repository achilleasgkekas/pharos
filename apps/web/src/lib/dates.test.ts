import { describe, expect, it, vi } from 'vitest';
import { isBlankOrValidDate, safeDate, safeDateOrNull } from './dates';

// dates.ts parses receipt/statement dates that native `new Date()` mishandles.
// The critical rule: European day-first (DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY) is
// reordered to ISO so a Greek receipt's "03/04/2025" becomes 3 April, not 4 March.
// EU-branch inputs become UTC midnight (#355), like every other date-only value, so the
// UTC getters give the printed day on any server; ISO date-only strings are parsed as UTC
// by V8 too, so those we compare via getTime() against a reference to stay portable.

const FALLBACK = new Date('2000-01-01T00:00:00Z');

describe('safeDate — European day-first parsing', () => {
  it('stores the day at UTC midnight, whatever zone the server runs in (#355)', () => {
    expect(safeDate('23/09/2025', FALLBACK).toISOString()).toBe('2025-09-23T00:00:00.000Z');
  });

  it('parses DD/MM/YYYY as day-first', () => {
    const d = safeDate('23/09/2025', FALLBACK);
    expect(d.getUTCFullYear()).toBe(2025);
    expect(d.getUTCMonth()).toBe(8); // September (0-indexed)
    expect(d.getUTCDate()).toBe(23);
  });

  it('parses DD-MM-YYYY with hyphen separators', () => {
    const d = safeDate('23-09-2025', FALLBACK);
    expect(d.getUTCFullYear()).toBe(2025);
    expect(d.getUTCMonth()).toBe(8);
    expect(d.getUTCDate()).toBe(23);
  });

  it('parses DD.MM.YYYY with dot separators', () => {
    const d = safeDate('23.09.2025', FALLBACK);
    expect(d.getUTCFullYear()).toBe(2025);
    expect(d.getUTCMonth()).toBe(8);
    expect(d.getUTCDate()).toBe(23);
  });

  it('accepts single-digit day and month', () => {
    const d = safeDate('3/4/2025', FALLBACK);
    expect(d.getUTCMonth()).toBe(3); // April
    expect(d.getUTCDate()).toBe(3);
  });

  it('treats the first group as the day even when it exceeds 12', () => {
    // 13/04/2025 could only be day-first; proves it is not read as month-first.
    const d = safeDate('13/04/2025', FALLBACK);
    expect(d.getUTCMonth()).toBe(3); // April
    expect(d.getUTCDate()).toBe(13);
  });

  it('trims surrounding whitespace before parsing', () => {
    const d = safeDate('  23/09/2025  ', FALLBACK);
    expect(d.getUTCFullYear()).toBe(2025);
    expect(d.getUTCMonth()).toBe(8);
    expect(d.getUTCDate()).toBe(23);
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
    expect(d?.getUTCMonth()).toBe(8);
    expect(d?.getUTCDate()).toBe(23);
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


// #404: an impossible day used to roll over (31/02 → 3 March) or, once the form sent '', save as today.
describe('impossible days', () => {
  it.each(['31/02/2026', '30/02/2024', '29/02/2025', '31/04/2026', '2026-02-31', '2025-02-29T10:00:00Z', '2026-13-01'])(
    'reads %j as no date',
    (s) => {
      expect(safeDateOrNull(s)).toBeNull();
    }
  );

  it('still reads real leap days and timestamps', () => {
    expect(safeDateOrNull('29/02/2024')?.toISOString()).toBe('2024-02-29T00:00:00.000Z');
    expect(safeDateOrNull('2024-02-29')?.toISOString()).toBe('2024-02-29T00:00:00.000Z');
    expect(safeDateOrNull('2026-07-05T09:30:00.000Z')?.toISOString()).toBe('2026-07-05T09:30:00.000Z');
  });

  it('isBlankOrValidDate tells a date left out from one typed wrong', () => {
    for (const v of [undefined, null, '', '  ', '2026-07-05', '05/07/2026']) expect(isBlankOrValidDate(v), String(v)).toBe(true);
    for (const v of ['31/02/2026', '2026-02-31', 'tomorrow', 42]) expect(isBlankOrValidDate(v), String(v)).toBe(false);
  });
});
