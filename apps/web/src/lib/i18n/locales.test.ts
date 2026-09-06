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

// The translation dictionaries are pure data. English is the source of truth (it defines
// every key); the other locales are Partial<Dict>. The English fallback in resolveDict is a
// runtime SAFETY NET so a half-finished translation never renders blank — it is NOT a licence
// to let locales drift. POLICY (enforced below, 2026-09): every locale must define EVERY
// English key. This test fails on any gap, so a feature that adds English strings cannot merge
// until the seven locales are filled too — the drift that repeatedly left the UI half-English
// (it went unnoticed precisely because the fallback hid it) is now a red build, not a surprise.
// The guards also catch a stale/renamed key lingering in a translation and empty values.

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

  it('translates EVERY English key (no drift — fallback is a safety net, not a license to drift)', () => {
    const missing = [...EN_KEYS].filter((key) => !(key in dict));
    expect(
      missing,
      `${code}.ts is missing ${missing.length} key(s): ${missing.slice(0, 12).join(', ')}${missing.length > 12 ? ' …' : ''}. ` +
        `Fill them in src/lib/i18n/locales/${code}.ts — English fallback hides the gap in the UI but this build stays red until every key is translated.`,
    ).toEqual([]);
  });

  it('has no empty or whitespace-only values', () => {
    for (const [key, value] of Object.entries(dict)) {
      expect(typeof value, `${code}.${key} should be a string`).toBe('string');
      expect((value as string).trim().length, `${code}.${key} is blank`).toBeGreaterThan(0);
    }
  });
});

// The reports date-range selector (6 / 12 / 24 months) widens every windowed series on
// the page, but its captions used to be written as "last 12 months" in each language, so
// picking another window changed the charts while every label kept claiming 12 and the
// selector read as broken. These keys now interpolate the chosen window; a translation
// that drops the placeholder would silently bring the lie back.
const WINDOWED_KEYS = ['reports.cMonthlySpend', 'reports.cCashFlow', 'reports.spendAvgSub'] as const;

describe('windowed report captions', () => {
  it.each(WINDOWED_KEYS)('%s interpolates the selected window in English', (key) => {
    expect(en[key]).toContain('{n}');
  });

  it.each(WINDOWED_KEYS)('%s keeps the placeholder in every translation that defines it', (key) => {
    for (const [code, dict] of Object.entries(TRANSLATIONS)) {
      const value = dict[key];
      if (value === undefined) continue; // untranslated keys fall back to English
      expect(value, `${code}.${key} lost the {n} placeholder`).toContain('{n}');
      expect(value, `${code}.${key} still hardcodes a window`).not.toMatch(/\b12\b/);
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
