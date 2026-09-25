import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { numMap, normalizeSettings, APP_CONFIG_SELECT } from './appSettings';
import {
  DEFAULT_EXPENSE_CATEGORIES,
  DEFAULT_ITEM_CATEGORIES,
  DEFAULT_SUBSCRIPTION_CATEGORIES,
} from './taxonomies';
import { resolveDepreciation } from './depreciation';
import { defaultNotifyTypes } from './alertTypes';

describe('numMap', () => {
  it('keeps only positive finite numbers', () => {
    expect(numMap({ rent: 500, fuel: 120 })).toEqual({ rent: 500, fuel: 120 });
  });

  it('coerces numeric strings', () => {
    expect(numMap({ rent: '500', fuel: '12.5' })).toEqual({ rent: 500, fuel: 12.5 });
  });

  it('drops zero, negative, NaN and non-numeric values', () => {
    expect(numMap({ a: 0, b: -5, c: 'abc', d: NaN, e: 10 })).toEqual({ e: 10 });
  });

  it('drops Infinity (not finite)', () => {
    expect(numMap({ a: Infinity, b: -Infinity, c: 3 })).toEqual({ c: 3 });
  });

  it('ignores empty-string keys', () => {
    expect(numMap({ '': 100, rent: 100 })).toEqual({ rent: 100 });
  });

  it('returns {} for null, undefined and non-object input', () => {
    expect(numMap(null)).toEqual({});
    expect(numMap(undefined)).toEqual({});
    expect(numMap('nope')).toEqual({});
    expect(numMap(42)).toEqual({});
  });

  it('returns {} for an empty object', () => {
    expect(numMap({})).toEqual({});
  });
});

describe('normalizeSettings', () => {
  it('keeps a known shopping country and cleans its shop list; an unknown country is off (#319)', () => {
    const on = normalizeSettings({ shoppingCountry: 'gr', shoppingExtraShops: ['https://www.amazon.de/', 'bogus', 'amazon.de'] });
    expect(on.shoppingCountry).toBe('GR');
    expect(on.shoppingExtraShops).toEqual(['amazon.de']);
    expect(normalizeSettings({ shoppingCountry: 'XX' }).shoppingCountry).toBe('');
  });

  it('returns all hard defaults for null/undefined/empty doc', () => {
    const expected = {
      defaultItemView: 'grid',
      defaultWarrantyMonths: 24,
      warrantyAlertDays: 90,
      trialAlertDays: 2,
      billAlertDays: 5,
      documentAlertDays: 30,
      specialDateAlertDays: 7,
      maintenanceAlertDays: 7,
  lendingAlertDays: 3,
  staleClaimDays: 14,
      syncStaleDays: 7,
      subscriptionReviewIntervalDays: 0,
      autoAddStores: true,
      ntfyUrl: '',
      ntfyEnabled: false,
      currency: 'EUR',
      multiCurrency: false,
      defaultVatRate: 24,
      defaultReturnWindowDays: 14,
      shoppingCountry: '',
      shoppingExtraShops: [],
      expenseCategories: DEFAULT_EXPENSE_CATEGORIES,
      itemCategories: DEFAULT_ITEM_CATEGORIES,
      subscriptionCategories: DEFAULT_SUBSCRIPTION_CATEGORIES,
      spaces: [],
      budgets: {},
      budgetRollover: false,
      assetAccounts: {},
      depreciation: resolveDepreciation(undefined),
      categoryRules: [],
      onboardingDismissed: false,
      notifyTypes: defaultNotifyTypes(),
      quietHours: { start: '', end: '' },
    };
    expect(normalizeSettings(null)).toEqual(expected);
    expect(normalizeSettings(undefined)).toEqual(expected);
    expect(normalizeSettings({})).toEqual(expected);
  });

  it('defaultItemView: only "list" flips off the grid default', () => {
    expect(normalizeSettings({ defaultItemView: 'list' }).defaultItemView).toBe('list');
    expect(normalizeSettings({ defaultItemView: 'grid' }).defaultItemView).toBe('grid');
    expect(normalizeSettings({ defaultItemView: 'weird' }).defaultItemView).toBe('grid');
  });

  it('autoAddStores is true unless explicitly false', () => {
    expect(normalizeSettings({ autoAddStores: true }).autoAddStores).toBe(true);
    expect(normalizeSettings({ autoAddStores: false }).autoAddStores).toBe(false);
    // undefined → default on
    expect(normalizeSettings({}).autoAddStores).toBe(true);
  });

  it('ntfyEnabled is coerced to a real boolean', () => {
    expect(normalizeSettings({ ntfyEnabled: true }).ntfyEnabled).toBe(true);
    expect(normalizeSettings({ ntfyEnabled: false }).ntfyEnabled).toBe(false);
  });

  it('numeric fields honour 0 (typeof number) instead of falling back to defaults', () => {
    const v = normalizeSettings({ defaultWarrantyMonths: 0, warrantyAlertDays: 0, defaultVatRate: 0, trialAlertDays: 0, billAlertDays: 0, documentAlertDays: 0, specialDateAlertDays: 0 });
    expect(v.defaultWarrantyMonths).toBe(0);
    expect(v.warrantyAlertDays).toBe(0);
    expect(v.defaultVatRate).toBe(0);
    expect(v.trialAlertDays).toBe(0);
    expect(v.billAlertDays).toBe(0);
    expect(v.documentAlertDays).toBe(0);
    expect(v.specialDateAlertDays).toBe(0);
  });

  it('numeric fields use stored values when present', () => {
    const v = normalizeSettings({ defaultWarrantyMonths: 12, warrantyAlertDays: 30, defaultVatRate: 19, trialAlertDays: 5, billAlertDays: 7, documentAlertDays: 14, specialDateAlertDays: 3 });
    expect(v.defaultWarrantyMonths).toBe(12);
    expect(v.warrantyAlertDays).toBe(30);
    expect(v.defaultVatRate).toBe(19);
    expect(v.trialAlertDays).toBe(5);
    expect(v.billAlertDays).toBe(7);
    expect(v.documentAlertDays).toBe(14);
    expect(v.specialDateAlertDays).toBe(3);
  });

  it('defaultReturnWindowDays honours 0 (off) and stored values, rejects negatives', () => {
    expect(normalizeSettings({ defaultReturnWindowDays: 0 }).defaultReturnWindowDays).toBe(0);
    expect(normalizeSettings({ defaultReturnWindowDays: 30 }).defaultReturnWindowDays).toBe(30);
    expect(normalizeSettings({ defaultReturnWindowDays: -5 }).defaultReturnWindowDays).toBe(14);
    expect(normalizeSettings({}).defaultReturnWindowDays).toBe(14);
  });

  it('empty currency string falls back to EUR default', () => {
    expect(normalizeSettings({ currency: '' }).currency).toBe('EUR');
    expect(normalizeSettings({ currency: 'USD' }).currency).toBe('USD');
  });

  it('ntfyUrl empty string when absent, passed through when set', () => {
    expect(normalizeSettings({}).ntfyUrl).toBe('');
    expect(normalizeSettings({ ntfyUrl: 'https://ntfy.sh/topic' }).ntfyUrl).toBe('https://ntfy.sh/topic');
  });

  it('resolves taxonomy overrides from the lists map', () => {
    const v = normalizeSettings({ lists: { expenseCategories: ['a', 'b'], itemCategories: ['x'] } });
    expect(v.expenseCategories).toEqual(['a', 'b']);
    expect(v.itemCategories).toEqual(['x']);
    // untouched taxonomy falls back to default
    expect(v.subscriptionCategories).toEqual(DEFAULT_SUBSCRIPTION_CATEGORIES);
  });

  it('empty override arrays fall back to defaults', () => {
    const v = normalizeSettings({ lists: { expenseCategories: [] } });
    expect(v.expenseCategories).toEqual(DEFAULT_EXPENSE_CATEGORIES);
  });

  it('spaces default to empty and are normalized when present (P34)', () => {
    expect(normalizeSettings({}).spaces).toEqual([]);
    expect(normalizeSettings({ spaces: ['Home', ' Holiday house '] }).spaces).toEqual(['Home', 'Holiday house']);
    // case-insensitive dedupe, casing preserved; non-array → []
    expect(normalizeSettings({ spaces: ['Home', 'home'] }).spaces).toEqual(['Home']);
    expect(normalizeSettings({ spaces: 'nope' as unknown as string[] }).spaces).toEqual([]);
  });

  it('coerces the budgets map (drops non-positive/invalid)', () => {
    const v = normalizeSettings({ budgets: { rent: 500, junk: -1, bad: 'x' } });
    expect(v.budgets).toEqual({ rent: 500 });
  });

  it('reads the budgetRollover flag (default false, coerced to boolean)', () => {
    expect(normalizeSettings({}).budgetRollover).toBe(false);
    expect(normalizeSettings({ budgetRollover: true }).budgetRollover).toBe(true);
    expect(normalizeSettings({ budgetRollover: undefined }).budgetRollover).toBe(false);
  });
});

// The projection whitelist in getAppSettings() is the trap that shipped a no-op setting twice:
// the field is in the model, the type and normalizeSettings, but not in `.select(...)`, so the
// query never fetches it and the setting silently stays on its default. APP_CONFIG_SELECT is
// now derived from a map that `satisfies Record<keyof RawAppConfigDoc, true>`, which makes the
// gap a compile error. These tests read the source so the guard also survives a future edit
// that drops the `satisfies` clause or goes back to a hand-written string.
describe('APP_CONFIG_SELECT (settings projection)', () => {
  const source = readFileSync(fileURLToPath(new URL('./appSettings.ts', import.meta.url)), 'utf8');
  const projected = APP_CONFIG_SELECT.split(' ');

  it('projects every RawAppConfigDoc field, and nothing else', () => {
    const typeBlock = /export type RawAppConfigDoc = \{([\s\S]*?)\n\};/.exec(source);
    expect(typeBlock).not.toBeNull();
    const declared = [...typeBlock![1].matchAll(/^\s*(\w+)\?:/gm)].map((m) => m[1]);
    expect(declared.length).toBeGreaterThan(20); // the regex still matches the real type
    expect([...projected].sort()).toEqual([...declared].sort());
  });

  it('projects every field normalizeSettings actually reads', () => {
    // A read of a field the query never fetched is the user-visible half of the bug: the
    // setting looks wired end-to-end and still resolves to its hard default at runtime.
    const read = [...source.matchAll(/doc\?\.(\w+)/g)].map((m) => m[1]);
    expect(read.length).toBeGreaterThan(20);
    expect([...new Set(read)].filter((f) => !projected.includes(f))).toEqual([]);
  });

  it('is a clean space-separated list with no duplicates', () => {
    expect(APP_CONFIG_SELECT).not.toMatch(/\s{2,}|^\s|\s$/);
    expect(new Set(projected).size).toBe(projected.length);
  });
});
