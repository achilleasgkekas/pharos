import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LOCALE,
  LOCALE_CODES,
  LOCALE_COOKIE,
  LOCALES,
  isLocale,
} from './config';

// i18n/config.ts is pure: it declares the supported-locale table and an isLocale
// type guard used to validate the locale cookie before it is trusted. No I/O — the
// values are static, so these tests pin the invariants the rest of the i18n stack
// (getLocale, resolveDict) relies on: the default is always resolvable, codes are
// unique, and the guard rejects anything not in the table.

describe('LOCALES table', () => {
  it('exposes English as the source locale', () => {
    // en is the fallback base in resolveDict/makeT, so it MUST be present.
    expect(LOCALE_CODES).toContain('en');
    expect(LOCALES.find((l) => l.code === 'en')?.name).toBe('English');
  });

  it('derives LOCALE_CODES 1:1 from the LOCALES table', () => {
    expect(LOCALE_CODES).toEqual(LOCALES.map((l) => l.code));
    expect(LOCALE_CODES.length).toBe(LOCALES.length);
  });

  it('has no duplicate codes', () => {
    expect(new Set(LOCALE_CODES).size).toBe(LOCALE_CODES.length);
  });

  it('gives every locale a non-empty display name', () => {
    for (const l of LOCALES) {
      expect(l.code, 'code should be a lowercase 2-letter tag').toMatch(/^[a-z]{2}$/);
      expect(l.name.trim().length, `${l.code} needs a display name`).toBeGreaterThan(0);
    }
  });

  it('defaults to a locale that actually exists in the table', () => {
    expect(LOCALE_CODES).toContain(DEFAULT_LOCALE);
    expect(isLocale(DEFAULT_LOCALE)).toBe(true);
  });

  it('uses a stable, namespaced cookie name', () => {
    // getLocale reads this cookie; renaming it silently would reset everyone's locale.
    expect(LOCALE_COOKIE).toBe('pharos_locale');
  });
});

describe('isLocale', () => {
  it('accepts every supported code', () => {
    for (const code of LOCALE_CODES) {
      expect(isLocale(code)).toBe(true);
    }
  });

  it('rejects unknown or malformed codes', () => {
    for (const bad of ['EN', 'en-US', 'xx', 'english', 'gr', ' el', 'el ', '']) {
      expect(isLocale(bad), `${JSON.stringify(bad)} should be rejected`).toBe(false);
    }
  });

  it('rejects null and undefined (cookie may be absent)', () => {
    expect(isLocale(undefined)).toBe(false);
    expect(isLocale(null)).toBe(false);
  });

  it('narrows the type so a validated value is usable as a Locale', () => {
    const raw: string | undefined = 'de';
    if (isLocale(raw)) {
      // Compile-time proof the guard narrows string -> Locale; runtime sanity too.
      const loc: (typeof LOCALE_CODES)[number] = raw;
      expect(loc).toBe('de');
    } else {
      throw new Error('isLocale should have accepted "de"');
    }
  });
});
