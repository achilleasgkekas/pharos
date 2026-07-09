import { describe, expect, it } from 'vitest';
import {
  detectDelimiter, parseCsv, guessMapping, looksLikeHeader,
  parseCsvAmount, parseCsvDate, mapCsvRow, csvDedupeKey,
} from './csvImport';

// lib/csvImport.ts is the pure half of the bank/CSV import (PA1): RFC-4180 parsing,
// header/column auto-detection and EU/US amount+date coercion. The client uses it to
// preview, the server action re-validates the mapped rows it produces.

describe('detectDelimiter', () => {
  it('picks comma by default', () => {
    expect(detectDelimiter('a,b,c\n1,2,3')).toBe(',');
  });
  it('picks semicolon when it dominates (common in EU bank exports)', () => {
    expect(detectDelimiter('date;amount;desc\n01/02/2026;12,50;ΔΕΗ')).toBe(';');
  });
  it('picks tab for TSV', () => {
    expect(detectDelimiter('a\tb\tc\n1\t2\t3')).toBe('\t');
  });
  it('ignores delimiters inside quoted cells', () => {
    // Commas only appear inside quotes; the real delimiter is the semicolon.
    expect(detectDelimiter('"a, with, commas";b\n"x, y";2')).toBe(';');
  });
});

describe('parseCsv', () => {
  it('parses plain rows and drops blank lines', () => {
    expect(parseCsv('a,b\n1,2\n\n3,4\n')).toEqual([['a', 'b'], ['1', '2'], ['3', '4']]);
  });
  it('handles quoted cells with embedded delimiter, escaped quotes and newlines', () => {
    const rows = parseCsv('"hello, world","she said ""hi""","line1\nline2"');
    expect(rows).toEqual([['hello, world', 'she said "hi"', 'line1\nline2']]);
  });
  it('handles CRLF line endings and a UTF-8 BOM', () => {
    expect(parseCsv('\uFEFFa,b\r\n1,2\r\n')).toEqual([['a', 'b'], ['1', '2']]);
  });
});

describe('parseCsvAmount', () => {
  it('parses EU format (dot thousands, comma decimal)', () => {
    expect(parseCsvAmount('1.234,56')).toBe(1234.56);
    expect(parseCsvAmount('12,30')).toBe(12.3);
  });
  it('parses US format (comma thousands, dot decimal)', () => {
    expect(parseCsvAmount('1,234.56')).toBe(1234.56);
    expect(parseCsvAmount('12.30')).toBe(12.3);
  });
  it('treats a lone separator with 3 trailing digits as thousands', () => {
    expect(parseCsvAmount('1,234')).toBe(1234);
    expect(parseCsvAmount('1.234')).toBe(1234);
  });
  it('handles negatives, parentheses and currency symbols', () => {
    expect(parseCsvAmount('-12,30')).toBe(-12.3);
    expect(parseCsvAmount('(12.30)')).toBe(-12.3);
    expect(parseCsvAmount('€ 45,00')).toBe(45);
    expect(parseCsvAmount('+7.5')).toBe(7.5);
  });
  it('rejects non-numbers and empty cells', () => {
    expect(parseCsvAmount('ΔΕΗ')).toBeNull();
    expect(parseCsvAmount('')).toBeNull();
    expect(parseCsvAmount('12abc')).toBeNull();
  });
});

describe('parseCsvDate', () => {
  it('parses ISO dates', () => {
    expect(parseCsvDate('2026-07-09')).toBe('2026-07-09');
    expect(parseCsvDate('2026/7/9')).toBe('2026-07-09');
  });
  it('parses EU day-first dates in all common separators', () => {
    expect(parseCsvDate('09/07/2026')).toBe('2026-07-09');
    expect(parseCsvDate('9.7.2026')).toBe('2026-07-09');
    expect(parseCsvDate('09-07-26')).toBe('2026-07-09');
  });
  it('swaps to month-first only when day-first is impossible', () => {
    // 07/25 can only be July 25th (25 is not a month).
    expect(parseCsvDate('07/25/2026')).toBe('2026-07-25');
    // Ambiguous stays day-first (EU exports).
    expect(parseCsvDate('03/04/2026')).toBe('2026-04-03');
  });
  it('rejects garbage and impossible dates', () => {
    expect(parseCsvDate('notadate')).toBeNull();
    expect(parseCsvDate('31/02/2026')).toBeNull();
    expect(parseCsvDate('')).toBeNull();
  });
});

describe('guessMapping / looksLikeHeader', () => {
  it('maps English bank headers', () => {
    const m = guessMapping(['Booking Date', 'Description', 'Amount', 'Category']);
    expect(m).toMatchObject({ date: 0, vendor: 1, amount: 2, category: 3 });
  });
  it('maps Greek bank headers', () => {
    const m = guessMapping(['Ημερομηνία', 'Περιγραφή', 'Ποσό']);
    expect(m).toMatchObject({ date: 0, vendor: 1, amount: 2 });
  });
  it('does not assign the same column twice', () => {
    // "Description" matches vendor first; notes must not steal or reuse it.
    const m = guessMapping(['Date', 'Description', 'Amount']);
    expect(m.notes).toBeUndefined();
    expect(m.vendor).toBe(1);
  });
  it('detects a header row vs headerless data', () => {
    expect(looksLikeHeader([['Date', 'Amount', 'Payee'], ['01/02/2026', '12,50', 'ΔΕΗ']])).toBe(true);
    expect(looksLikeHeader([['01/02/2026', '12,50', 'ΔΕΗ'], ['02/02/2026', '9,90', 'COSMOTE']])).toBe(false);
  });
});

describe('mapCsvRow', () => {
  const mapping = { date: 0, amount: 1, vendor: 2, notes: 3 };
  it('produces a parsed row from mapped cells', () => {
    const r = mapCsvRow(['09/07/2026', '-45,90', 'ΔΕΗ', 'ρεύμα'], mapping);
    expect(r).toEqual({ ok: true, row: { date: '2026-07-09', amount: -45.9, vendor: 'ΔΕΗ', category: '', notes: 'ρεύμα' } });
  });
  it('flags rows with a bad date, bad/zero amount, or no vendor', () => {
    expect(mapCsvRow(['garbage', '10', 'X'], mapping)).toEqual({ ok: false, error: 'bad-date' });
    expect(mapCsvRow(['09/07/2026', '0,00', 'X'], mapping)).toEqual({ ok: false, error: 'bad-amount' });
    expect(mapCsvRow(['09/07/2026', '10', ''], mapping)).toEqual({ ok: false, error: 'no-vendor' });
  });
});

describe('csvDedupeKey', () => {
  it('is stable across sign and datetime noise (same transaction = same key)', () => {
    expect(csvDedupeKey('expense', 'dei', '2026-07-09', -45.9))
      .toBe(csvDedupeKey('expense', 'dei', '2026-07-09T00:00:00.000Z', 45.9));
  });
  it('differs across kind, vendor, day and amount', () => {
    const base = csvDedupeKey('expense', 'dei', '2026-07-09', 45.9);
    expect(csvDedupeKey('income', 'dei', '2026-07-09', 45.9)).not.toBe(base);
    expect(csvDedupeKey('expense', 'cosmote', '2026-07-09', 45.9)).not.toBe(base);
    expect(csvDedupeKey('expense', 'dei', '2026-07-10', 45.9)).not.toBe(base);
    expect(csvDedupeKey('expense', 'dei', '2026-07-09', 45.91)).not.toBe(base);
  });
});
