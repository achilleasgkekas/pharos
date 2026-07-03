import { describe, it, expect } from 'vitest';
import { matchIn, type StoreLite } from './storeService';

// Fixtures mirror the shape produced by getStores() (name + lowercase-ish aliases).
const STORES: StoreLite[] = [
  { name: 'Κωτσόβολος', aliases: ['kotsovolos', 'kwtsovolos'] },
  { name: 'Πλαίσιο', aliases: ['plaisio', 'plaisio computers'] },
  { name: 'Skroutz', aliases: ['skroutz.gr'] },
  { name: 'IKEA', aliases: ['ikea'] }, // alias exactly 4 chars (inclusive boundary)
  { name: 'MediaMarkt', aliases: [] }, // no aliases → name-only matching
  { name: 'BP', aliases: ['bp'] }, // 2-char alias, below the substring length guard
];

describe('matchIn', () => {
  it('returns null for empty / whitespace-only input', () => {
    expect(matchIn('', STORES)).toBeNull();
    expect(matchIn('   ', STORES)).toBeNull();
    expect(matchIn('\t\n', STORES)).toBeNull();
  });

  it('returns null when nothing matches', () => {
    expect(matchIn('Some Unknown Shop', STORES)).toBeNull();
  });

  it('matches store name exactly, case-insensitively', () => {
    expect(matchIn('MediaMarkt', STORES)).toBe('MediaMarkt');
    expect(matchIn('mediamarkt', STORES)).toBe('MediaMarkt');
    expect(matchIn('  MEDIAMARKT  ', STORES)).toBe('MediaMarkt');
  });

  it('matches store name with Greek characters', () => {
    expect(matchIn('Κωτσόβολος', STORES)).toBe('Κωτσόβολος');
  });

  it('matches an alias exactly, case-insensitively', () => {
    expect(matchIn('kotsovolos', STORES)).toBe('Κωτσόβολος');
    expect(matchIn('KOTSOVOLOS', STORES)).toBe('Κωτσόβολος');
    expect(matchIn('plaisio', STORES)).toBe('Πλαίσιο');
  });

  it('matches when a long (>=4) alias is a substring of the query', () => {
    // alias 'kotsovolos' (10 chars) contained in the longer receipt string
    expect(matchIn('ΚΩΤΣΟΒΟΛΟΣ kotsovolos athens store', STORES)).toBe('Κωτσόβολος');
    // alias 'skroutz.gr' contained in a URL-ish query
    expect(matchIn('https://skroutz.gr/order/123', STORES)).toBe('Skroutz');
  });

  it('matches when a long (>=4) query is a substring of an alias', () => {
    // query 'plaisio comp' is a substring of alias 'plaisio computers'
    expect(matchIn('plaisio comp', STORES)).toBe('Πλαίσιο');
  });

  it('treats length 4 as the inclusive boundary for alias-in-query substring', () => {
    // alias 'ikea' is exactly 4 chars, so 'ikea hellas' matches via substring
    expect(matchIn('ikea hellas', STORES)).toBe('IKEA');
  });

  it('does NOT match a short (<4) alias by substring', () => {
    // alias 'bp' (2 chars) is inside 'bp gas station' but under the length guard,
    // and 'bp gas station' is not an exact alias/name → null
    expect(matchIn('bp gas station', STORES)).toBeNull();
    // exact still works regardless of length
    expect(matchIn('bp', STORES)).toBe('BP');
    expect(matchIn('BP', STORES)).toBe('BP');
  });

  it('requires the query to be >=4 chars for the query-in-alias direction', () => {
    // 'pla' (3 chars) is inside alias 'plaisio' but too short → no substring match,
    // and it is not an exact alias/name → null
    expect(matchIn('pla', STORES)).toBeNull();
  });

  it('does not match a <4 fragment against a long alias', () => {
    // 'sk' is inside 'skroutz.gr' but under the length guard → no match
    expect(matchIn('sk', STORES)).toBeNull();
  });

  it('returns the first store in list order when multiple could match', () => {
    const ordered: StoreLite[] = [
      { name: 'Alpha', aliases: ['shared-alias-token'] },
      { name: 'Beta', aliases: ['shared-alias-token'] },
    ];
    expect(matchIn('shared-alias-token', ordered)).toBe('Alpha');
  });

  it('prefers an exact name match found earlier over a later alias match', () => {
    const stores: StoreLite[] = [
      { name: 'target-name', aliases: [] },
      { name: 'Other', aliases: ['target-name-extra'] },
    ];
    expect(matchIn('target-name', stores)).toBe('target-name');
  });

  it('returns null for an empty store list', () => {
    expect(matchIn('anything', [])).toBeNull();
  });

  it('handles a store with an empty-string alias without crashing', () => {
    const stores: StoreLite[] = [{ name: 'Weird', aliases: [''] }];
    // '' alias: not exact (query non-empty), length 0 (<4) so no substring match
    expect(matchIn('weird shop', stores)).toBeNull();
    expect(matchIn('Weird', stores)).toBe('Weird'); // still matches by name
  });
});
