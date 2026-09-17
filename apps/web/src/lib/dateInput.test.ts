import { describe, it, expect } from 'vitest';
import { dateLayout, formatIsoDate, parseLocaleDate, datePlaceholder } from './dateInput';

describe('dateLayout', () => {
  it('puts the day first for every European app locale, including British en', () => {
    for (const l of ['en', 'el', 'de', 'es', 'fr', 'it', 'nl', 'pt']) {
      expect(dateLayout(l).order).toEqual(['day', 'month', 'year']);
    }
  });

  it('reads US order from Intl rather than hardcoding day-first', () => {
    expect(dateLayout('en-US').order).toEqual(['month', 'day', 'year']);
  });

  it('uses the locale separator', () => {
    expect(dateLayout('de').separator).toBe('.');
    expect(dateLayout('el').separator).toBe('/');
  });

  it('falls back instead of throwing on a malformed locale tag', () => {
    expect(dateLayout('not a locale!!').order).toEqual(['day', 'month', 'year']);
  });
});

describe('formatIsoDate', () => {
  it('formats ISO in the locale order', () => {
    expect(formatIsoDate('2026-09-17', 'el')).toBe('17/09/2026');
    expect(formatIsoDate('2026-09-17', 'de')).toBe('17.09.2026');
    expect(formatIsoDate('2026-09-17', 'en-US')).toBe('09/17/2026');
  });

  it('returns empty for empty or invalid ISO', () => {
    expect(formatIsoDate('', 'el')).toBe('');
    expect(formatIsoDate('2026-02-30', 'el')).toBe('');
    expect(formatIsoDate('17/09/2026', 'el')).toBe('');
  });
});

describe('parseLocaleDate', () => {
  it('parses the locale order into ISO', () => {
    expect(parseLocaleDate('17/09/2026', 'el')).toBe('2026-09-17');
    expect(parseLocaleDate('09/17/2026', 'en-US')).toBe('2026-09-17');
  });

  it('never reads a Greek date as month-first', () => {
    // The exact bug in #3: 03/04 must be 3 April in Greek, not 4 March.
    expect(parseLocaleDate('03/04/2026', 'el')).toBe('2026-04-03');
  });

  it('accepts any separator and single-digit fields', () => {
    expect(parseLocaleDate('7.9.2026', 'el')).toBe('2026-09-07');
    expect(parseLocaleDate(' 17-09-2026 ', 'nl')).toBe('2026-09-17');
  });

  it('returns empty string for blank text', () => {
    expect(parseLocaleDate('', 'el')).toBe('');
    expect(parseLocaleDate('   ', 'el')).toBe('');
  });

  it('rejects impossible or incomplete dates', () => {
    expect(parseLocaleDate('31/02/2026', 'el')).toBeNull();
    expect(parseLocaleDate('29/02/2025', 'el')).toBeNull();
    expect(parseLocaleDate('17/13/2026', 'el')).toBeNull();
    expect(parseLocaleDate('17/09', 'el')).toBeNull();
    expect(parseLocaleDate('17/09/26', 'el')).toBeNull();
    expect(parseLocaleDate('abc', 'el')).toBeNull();
  });

  it('accepts leap days', () => {
    expect(parseLocaleDate('29/02/2028', 'el')).toBe('2028-02-29');
  });

  it('round-trips ISO through format and parse', () => {
    for (const l of ['en', 'el', 'de', 'nl', 'en-US']) {
      for (const iso of ['2026-01-01', '2028-02-29', '1999-12-31']) {
        expect(parseLocaleDate(formatIsoDate(iso, l), l)).toBe(iso);
      }
    }
  });
});

describe('datePlaceholder', () => {
  it('builds the placeholder in locale order', () => {
    expect(datePlaceholder('el', { day: 'ΗΗ', month: 'ΜΜ', year: 'ΕΕΕΕ' })).toBe('ΗΗ/ΜΜ/ΕΕΕΕ');
    expect(datePlaceholder('de', { day: 'TT', month: 'MM', year: 'JJJJ' })).toBe('TT.MM.JJJJ');
  });
});
