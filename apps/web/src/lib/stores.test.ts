import { describe, expect, it } from 'vitest';
import { KNOWN_STORES, STORE_NAMES, matchStore } from './stores';

// stores.ts is the curated, code-managed store list plus a pure `matchStore` normalizer.
// It has no imports (beyond its own types), no DB, no fs, no clock, so every branch of the
// matcher is exercisable in isolation. matchStore feeds the store name the AI extracts from
// receipts/statements/products, so locking its behavior guards a lot of downstream data.

describe('matchStore — exact name match', () => {
  it('matches a known store name case-insensitively', () => {
    expect(matchStore('Skroutz')).toBe('Skroutz');
    expect(matchStore('SKROUTZ')).toBe('Skroutz');
    expect(matchStore('skroutz')).toBe('Skroutz');
  });

  it('trims surrounding whitespace before matching the name', () => {
    expect(matchStore('  Skroutz  ')).toBe('Skroutz');
    expect(matchStore('\tPublic\n')).toBe('Public');
  });

  it('matches a Greek store name (lowercasing preserves Greek letters)', () => {
    expect(matchStore('Κωτσόβολος')).toBe('Κωτσόβολος');
    expect(matchStore('κωτσόβολος')).toBe('Κωτσόβολος');
    expect(matchStore('Πλαίσιο')).toBe('Πλαίσιο');
  });
});

describe('matchStore — exact alias match', () => {
  it('matches a full alias regardless of alias length', () => {
    // "dji" is a 3-char alias; exact equality still resolves it even though the
    // substring guards below require length >= 4.
    expect(matchStore('dji')).toBe('DJI Store');
    expect(matchStore('DJI')).toBe('DJI Store');
  });

  it('resolves a Greek alias to the canonical (Latin or Greek) name', () => {
    expect(matchStore('kotsovolos')).toBe('Κωτσόβολος');
    expect(matchStore('γερμανος')).toBe('Germanos');
    expect(matchStore('plaisio')).toBe('Πλαίσιο');
  });

  it('resolves a domain-style alias', () => {
    expect(matchStore('amazon.de')).toBe('Amazon');
    expect(matchStore('eu.store.ui.com')).toBe('EU Store (Ubiquiti)');
    expect(matchStore('plaisio.gr')).toBe('Πλαίσιο');
  });
});

describe('matchStore — substring matching (length-guarded)', () => {
  it('matches when the input contains an alias of length >= 4', () => {
    expect(matchStore('bought from ikea today')).toBe('IKEA');
    expect(matchStore('order at mediamarkt store')).toBe('MediaMarkt');
  });

  it('matches when an alias contains the input of length >= 4', () => {
    // q = "mediamar" (8 chars) is a substring of alias "mediamarkt"
    expect(matchStore('mediamar')).toBe('MediaMarkt');
    // q = "kotsovolo" is a substring of alias "kotsovolos"
    expect(matchStore('kotsovolo')).toBe('Κωτσόβολος');
  });

  it('does NOT substring-match short aliases (< 4 chars) to avoid noise', () => {
    // "dji" (3 chars) must not match a longer phrase that merely contains it.
    expect(matchStore('the dji drone box')).toBe('the dji drone box');
  });

  it('does NOT match a 3-char query embedded in a longer alias', () => {
    // q length < 4 blocks the `a.includes(q)` branch as well.
    expect(matchStore('bay')).toBe('bay');
  });
});

describe('matchStore — no match / passthrough', () => {
  it('returns the trimmed raw string, preserving original case, when unknown', () => {
    expect(matchStore('Some Random Shop')).toBe('Some Random Shop');
    expect(matchStore('  Local Bakery  ')).toBe('Local Bakery');
  });

  it('returns "" for empty / whitespace-only input', () => {
    expect(matchStore('')).toBe('');
    expect(matchStore('   ')).toBe('');
    expect(matchStore('\t\n')).toBe('');
  });

  it('coerces null / undefined to "" without throwing', () => {
    expect(matchStore(null as unknown as string)).toBe('');
    expect(matchStore(undefined as unknown as string)).toBe('');
  });

  it('does not lowercase the passthrough value', () => {
    expect(matchStore('MixedCase Unknown')).toBe('MixedCase Unknown');
  });
});

describe('matchStore — precedence', () => {
  it('returns the first store in array order when several could match', () => {
    // Sanity: an exact name always wins for its own store; verify a known name
    // resolves to itself and not to some earlier substring collision.
    expect(matchStore('Apple Store')).toBe('Apple Store');
    expect(matchStore('AliExpress')).toBe('AliExpress');
  });
});

describe('KNOWN_STORES — structural invariants', () => {
  it('is a non-empty list', () => {
    expect(KNOWN_STORES.length).toBeGreaterThan(0);
  });

  it('every entry has a non-empty name and an aliases array', () => {
    for (const s of KNOWN_STORES) {
      expect(typeof s.name).toBe('string');
      expect(s.name.trim().length).toBeGreaterThan(0);
      expect(Array.isArray(s.aliases)).toBe(true);
    }
  });

  it('has unique store names', () => {
    const names = KNOWN_STORES.map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('stores every alias in lowercase (matchStore lowercases the query)', () => {
    for (const s of KNOWN_STORES) {
      for (const a of s.aliases) {
        expect(a).toBe(a.toLowerCase());
      }
    }
  });

  it('resolves each store from at least one of its own aliases', () => {
    for (const s of KNOWN_STORES) {
      if (s.aliases.length === 0) continue;
      expect(matchStore(s.aliases[0])).toBe(s.name);
    }
  });
});

describe('STORE_NAMES', () => {
  it('mirrors the names of KNOWN_STORES in order', () => {
    expect(STORE_NAMES).toEqual(KNOWN_STORES.map((s) => s.name));
  });

  it('every listed name round-trips through matchStore', () => {
    for (const name of STORE_NAMES) {
      expect(matchStore(name)).toBe(name);
    }
  });
});
