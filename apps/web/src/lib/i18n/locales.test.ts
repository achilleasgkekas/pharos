import { describe, expect, it } from 'vitest';
import { en, type Dict } from './locales/en';
import { el } from './locales/el';
import { es } from './locales/es';
import { fr } from './locales/fr';
import { de } from './locales/de';
import { it as itDict } from './locales/it';
import { pt } from './locales/pt';
import { nl } from './locales/nl';
import { LOCALE_CODES } from './config';
import { resolveDict } from './index';

// The translation dictionaries are pure data. English is the source of truth (it
// defines every key); the other locales are Partial<Dict> and fall back to English
// for anything they omit. These tests guard the two failure modes the type system
// does NOT catch at runtime: a stale/renamed key lingering in a translation (which
// would silently never be used), and empty/whitespace values (which would render
// blank instead of falling back). We deliberately do NOT assert full coverage —
// partial translations are intentional and English fills the gaps.

const TRANSLATIONS: Record<string, Partial<Dict>> = {
  el,
  es,
  fr,
  de,
  it: itDict,
  pt,
  nl,
};

const EN_KEYS = new Set(Object.keys(en));

describe('English source dictionary', () => {
  it('has no empty values', () => {
    for (const [k, v] of Object.entries(en)) {
      expect(typeof v, `${k} should be a string`).toBe('string');
      expect(v.trim().length, `${k} is empty`).toBeGreaterThan(0);
    }
  });

  it('defines a meaningful number of keys', () => {
    // Sanity floor so an accidental truncation of en.ts is caught.
    expect(EN_KEYS.size).toBeGreaterThan(100);
  });
});

describe.each(Object.entries(TRANSLATIONS))('%s dictionary', (code, dict) => {
  it('only contains keys that exist in the English source (no stale keys)', () => {
    for (const key of Object.keys(dict)) {
      expect(EN_KEYS.has(key), `${code}: stale/renamed key "${key}" not in en.ts`).toBe(true);
    }
  });

  it('has no empty or whitespace-only values', () => {
    for (const [key, value] of Object.entries(dict)) {
      expect(typeof value, `${code}.${key} should be a string`).toBe('string');
      expect((value as string).trim().length, `${code}.${key} is blank`).toBeGreaterThan(0);
    }
  });
});

describe('registration', () => {
  it('every code in the LOCALES table resolves to a full dictionary', () => {
    for (const code of LOCALE_CODES) {
      const d = resolveDict(code);
      // Fallback completeness: every English key is present after layering.
      for (const key of EN_KEYS) {
        expect(d[key as keyof typeof en], `${code} missing ${key}`).toBeDefined();
      }
    }
  });

  it('covers exactly the non-English locales in the table', () => {
    const translated = new Set(Object.keys(TRANSLATIONS));
    const expected = LOCALE_CODES.filter((c) => c !== 'en');
    expect([...translated].sort()).toEqual([...expected].sort());
  });
});
