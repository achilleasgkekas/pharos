import { describe, expect, it } from 'vitest';
import { makeT, resolveDict, type Dict, type TKey } from './index';
import { LOCALE_CODES } from './config';
import { en } from './locales/en';

// i18n/index.ts is pure: resolveDict layers a locale's strings over the English base,
// and makeT builds a {var}-interpolating translate fn from a resolved dict. No I/O,
// DOM, or DB — deterministic. Interpolation/fallback edge cases use small synthetic
// dicts so the tests don't break when translation wording is edited; a couple of
// real-value assertions pin the layering behaviour on stable keys.

describe('resolveDict', () => {
  it('returns the English base intact for the "en" locale', () => {
    const d = resolveDict('en');
    expect(d['nav.inventory']).toBe('Inventory');
    expect(d['time.minutes']).toBe('{n}m ago');
  });

  it('overlays a locale\'s translations over English', () => {
    const el = resolveDict('el');
    expect(el['nav.inventory']).toBe('Αποθήκη'); // translated
    expect(el['time.minutes']).toBe('πριν {n}λ');
  });

  it('falls back to English for any key a locale does not translate', () => {
    // Every resolved dict must expose every English key (fallback completeness),
    // so no lookup can ever be undefined regardless of translation coverage.
    for (const code of LOCALE_CODES) {
      const d = resolveDict(code);
      for (const k of Object.keys(en) as TKey[]) {
        expect(d[k], `${code} missing key ${k}`).toBeDefined();
      }
    }
  });

  it('resolves every supported locale without throwing', () => {
    for (const code of LOCALE_CODES) {
      expect(() => resolveDict(code)).not.toThrow();
      expect(Object.keys(resolveDict(code)).length).toBeGreaterThanOrEqual(Object.keys(en).length);
    }
  });

  it('returns a fresh object — mutating the result does not corrupt the English base', () => {
    const d = resolveDict('el');
    const original = en['nav.inventory'];
    (d as Record<string, string>)['nav.inventory'] = 'MUTATED';
    expect(en['nav.inventory']).toBe(original);
    expect(en['nav.inventory']).not.toBe('MUTATED');
  });
});

describe('makeT — lookup', () => {
  it('returns the string for a known key', () => {
    const t = makeT(resolveDict('en'));
    expect(t('nav.inventory')).toBe('Inventory');
  });

  it('uses the resolved (translated) value', () => {
    const t = makeT(resolveDict('el'));
    expect(t('nav.inventory')).toBe('Αποθήκη');
  });

  it('falls back to the English base when the dict lacks a key', () => {
    // A partial dict (only one key) → any other key resolves through en[key].
    const t = makeT({ 'nav.inventory': 'X' } as unknown as Dict);
    expect(t('time.minutes')).toBe(en['time.minutes']); // '{n}m ago', from en fallback
  });

  it('falls back to the key string when neither dict nor en has it', () => {
    const t = makeT({} as unknown as Dict);
    expect(t('totally.unknown.key' as TKey)).toBe('totally.unknown.key');
  });
});

describe('makeT — {var} interpolation', () => {
  const t = makeT({ msg: 'Hello {name}, you have {count} items', repeat: '{x}-{x}-{x}' } as unknown as Dict);

  it('leaves the string untouched when no vars are passed', () => {
    expect(t('msg' as TKey)).toBe('Hello {name}, you have {count} items');
  });

  it('substitutes a single var', () => {
    expect(t('msg' as TKey, { name: 'Achilleas', count: 3 })).toBe('Hello Achilleas, you have 3 items');
  });

  it('coerces numeric vars to strings', () => {
    const nt = makeT({ n: 'count={n}' } as unknown as Dict);
    expect(nt('n' as TKey, { n: 0 })).toBe('count=0');
    expect(nt('n' as TKey, { n: 42 })).toBe('count=42');
  });

  it('replaces every occurrence of a repeated placeholder', () => {
    expect(t('repeat' as TKey, { x: 'a' })).toBe('a-a-a');
  });

  it('leaves unknown placeholders in place', () => {
    expect(t('msg' as TKey, { name: 'Bob' })).toBe('Hello Bob, you have {count} items');
  });

  it('ignores extra vars that match no placeholder', () => {
    const st = makeT({ s: 'static' } as unknown as Dict);
    expect(st('s' as TKey, { unused: 'z' })).toBe('static');
  });
});
