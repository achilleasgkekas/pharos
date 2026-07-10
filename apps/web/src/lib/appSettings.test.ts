import { describe, it, expect } from 'vitest';
import { numMap, normalizeSettings } from './appSettings';
import {
  DEFAULT_EXPENSE_CATEGORIES,
  DEFAULT_ITEM_CATEGORIES,
  DEFAULT_SUBSCRIPTION_CATEGORIES,
} from './taxonomies';
import { resolveDepreciation } from './depreciation';

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
  it('returns all hard defaults for null/undefined/empty doc', () => {
    const expected = {
      defaultItemView: 'grid',
      defaultWarrantyMonths: 24,
      warrantyAlertDays: 90,
      trialAlertDays: 2,
      giftCardAlertDays: 30,
      billAlertDays: 5,
      autoAddStores: true,
      ntfyUrl: '',
      ntfyEnabled: false,
      currency: 'EUR',
      defaultVatRate: 24,
      defaultReturnWindowDays: 14,
      expenseCategories: DEFAULT_EXPENSE_CATEGORIES,
      itemCategories: DEFAULT_ITEM_CATEGORIES,
      subscriptionCategories: DEFAULT_SUBSCRIPTION_CATEGORIES,
      budgets: {},
      budgetRollover: false,
      assetAccounts: {},
      depreciation: resolveDepreciation(undefined),
      categoryRules: [],
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
    const v = normalizeSettings({ defaultWarrantyMonths: 0, warrantyAlertDays: 0, defaultVatRate: 0, trialAlertDays: 0, giftCardAlertDays: 0, billAlertDays: 0 });
    expect(v.defaultWarrantyMonths).toBe(0);
    expect(v.warrantyAlertDays).toBe(0);
    expect(v.defaultVatRate).toBe(0);
    expect(v.trialAlertDays).toBe(0);
    expect(v.giftCardAlertDays).toBe(0);
    expect(v.billAlertDays).toBe(0);
  });

  it('numeric fields use stored values when present', () => {
    const v = normalizeSettings({ defaultWarrantyMonths: 12, warrantyAlertDays: 30, defaultVatRate: 19, trialAlertDays: 5, giftCardAlertDays: 45, billAlertDays: 7 });
    expect(v.defaultWarrantyMonths).toBe(12);
    expect(v.warrantyAlertDays).toBe(30);
    expect(v.defaultVatRate).toBe(19);
    expect(v.trialAlertDays).toBe(5);
    expect(v.giftCardAlertDays).toBe(45);
    expect(v.billAlertDays).toBe(7);
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
