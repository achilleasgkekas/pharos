import { describe, it, expect } from 'vitest';
import { fold, queryTerms, matchesQuery, haystack, sameLabel, accentInsensitiveSource } from './searchText';

// The reason this module exists: Greek receipts print in unaccented CAPITALS while
// people type accented lowercase, so plain toLowerCase().includes() misses the match.

describe('fold', () => {
  it('makes accented and unaccented Greek identical', () => {
    expect(fold('ΓΑΛΑ')).toBe(fold('γάλα'));
    expect(fold('ΨΩΜΊ')).toBe(fold('ψωμι'));
    expect(fold('Κρέας')).toBe(fold('ΚΡΕΑΣ'));
  });

  it('unifies final and medial sigma', () => {
    expect(fold('ΟΔΟΣ')).toBe(fold('οδός'));
    expect(fold('φώς')).toBe(fold('φωσ'));
  });

  it('strips Latin diacritics too', () => {
    expect(fold('Café')).toBe('cafe');
    expect(fold('JOSÉ')).toBe('jose');
  });

  it('collapses whitespace and trims', () => {
    expect(fold('  a   b  ')).toBe('a b');
  });

  it('tolerates null/undefined/numbers', () => {
    expect(fold(null)).toBe('');
    expect(fold(undefined)).toBe('');
    expect(fold(42)).toBe('42');
  });
});

describe('queryTerms', () => {
  it('splits on whitespace and folds each term', () => {
    expect(queryTerms('ΑΒ γάλα')).toEqual(['αβ', 'γαλα']);
  });

  it('keeps a quoted phrase as one term', () => {
    expect(queryTerms('"γάλα φρέσκο" αβ')).toEqual(['γαλα φρεσκο', 'αβ']);
  });

  it('returns nothing for an empty or whitespace-only query', () => {
    expect(queryTerms('')).toEqual([]);
    expect(queryTerms('   ')).toEqual([]);
    expect(queryTerms('""')).toEqual([]);
  });
});

describe('matchesQuery', () => {
  it('THE ONE THAT MATTERS: finds unaccented CAPS text from an accented query', () => {
    expect(matchesQuery('ΓΑΛΑ ΦΡΕΣΚΟ 1L', 'γάλα')).toBe(true);
    expect(matchesQuery('γάλα φρέσκο', 'ΓΑΛΑ')).toBe(true);
  });

  it('ANDs the terms and ignores their order', () => {
    const hay = 'ΑΒ ΒΑΣΙΛΟΠΟΥΛΟΣ ΓΑΛΑ ΨΩΜΙ';
    expect(matchesQuery(hay, 'γαλα αβ')).toBe(true);
    expect(matchesQuery(hay, 'αβ γαλα')).toBe(true);
    expect(matchesQuery(hay, 'αβ τυρι')).toBe(false);
  });

  it('matches everything when the query is empty', () => {
    expect(matchesQuery('anything', '')).toBe(true);
    expect(matchesQuery('', '   ')).toBe(true);
  });

  it('honours a quoted phrase as a contiguous run', () => {
    expect(matchesQuery('γάλα φρέσκο', '"γαλα φρεσκο"')).toBe(true);
    expect(matchesQuery('φρέσκο γάλα', '"γαλα φρεσκο"')).toBe(false);
  });
});

describe('haystack', () => {
  it('joins values and drops empties', () => {
    expect(haystack('ΑΒ', '', null, undefined, 12.5, ['ΓΑΛΑ', ''])).toBe('ΑΒ 12.5 ΓΑΛΑ');
  });

  it('drops false so a && guard can be passed inline', () => {
    expect(haystack('a', false, 'b')).toBe('a b');
  });
});

describe('sameLabel', () => {
  it('groups the spellings OCR produces for one store', () => {
    expect(sameLabel('ΑΒ ΒΑΣΙΛΟΠΟΥΛΟΣ', 'ΑΒ Βασιλόπουλος')).toBe(true);
    expect(sameLabel('ΑΒ', 'ΣΚΛΑΒΕΝΙΤΗΣ')).toBe(false);
  });
});

describe('accentInsensitiveSource', () => {
  const re = (q: string) => new RegExp(accentInsensitiveSource(q), 'i');

  it('matches accented and unaccented Greek in both directions', () => {
    expect(re('γαλα').test('ΓΑΛΑ ΦΡΕΣΚΟ')).toBe(true);
    expect(re('γάλα').test('ΓΑΛΑ ΦΡΕΣΚΟ')).toBe(true);
    expect(re('γαλα').test('γάλα φρέσκο')).toBe(true);
  });

  it('matches either sigma form', () => {
    expect(re('οδος').test('ΟΔΟΣ')).toBe(true);
    expect(re('οδος').test('οδός')).toBe(true);
  });

  it('still escapes regex metacharacters instead of executing them', () => {
    expect(accentInsensitiveSource('a.b')).toBe('[aáàâä]\\.b');
    expect(re('a.b').test('axb')).toBe(false);
    expect(re('a.b').test('a.b')).toBe(true);
  });

  it('does not blow up on an empty query', () => {
    expect(accentInsensitiveSource('')).toBe('');
  });
});
