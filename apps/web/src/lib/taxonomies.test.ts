import { describe, expect, it } from 'vitest';
import {
  DEFAULT_EXPENSE_CATEGORIES,
  DEFAULT_ITEM_CATEGORIES,
  DEFAULT_SUBSCRIPTION_CATEGORIES,
  TAXONOMY_META,
  normalizeList,
  resolveTaxonomy,
} from './taxonomies';

// taxonomies.ts is a pure, dependency-free module: the default dropdown lists plus two
// helpers (normalizeList / resolveTaxonomy) shared by the settings "dropdown lists" editor
// and getAppSettings(). No DB, no clock, no fs, so every branch is exercisable in isolation.

describe('normalizeList', () => {
  it('trims surrounding whitespace', () => {
    expect(normalizeList(['  rent  ', ' fuel '])).toEqual(['rent', 'fuel', 'other']);
  });

  it('lowercases every entry', () => {
    expect(normalizeList(['RENT', 'FuEl'])).toEqual(['rent', 'fuel', 'other']);
  });

  it('collapses internal whitespace runs into a single dash', () => {
    expect(normalizeList(['home   office', 'pet care'])).toEqual(['home-office', 'pet-care', 'other']);
  });

  it('dedupes case-insensitively (first occurrence wins ordering)', () => {
    expect(normalizeList(['rent', 'Rent', 'RENT', 'fuel'])).toEqual(['rent', 'fuel', 'other']);
  });

  it('dedupes values that normalize to the same slug', () => {
    // "home office" and "home   office" both slugify to "home-office"
    expect(normalizeList(['home office', 'home   office'])).toEqual(['home-office', 'other']);
  });

  it('drops empty / whitespace-only entries', () => {
    expect(normalizeList(['rent', '', '   ', 'fuel'])).toEqual(['rent', 'fuel', 'other']);
  });

  it('truncates each slug to 30 chars', () => {
    const long = 'a'.repeat(40);
    const [first] = normalizeList([long]);
    expect(first).toBe('a'.repeat(30));
    expect(first.length).toBe(30);
  });

  it('appends "other" when it is missing', () => {
    expect(normalizeList(['rent'])).toContain('other');
    expect(normalizeList(['rent']).at(-1)).toBe('other');
  });

  it('does not duplicate "other" when already present, but does not force it last', () => {
    // 'other' present mid-list stays where the user put it (no re-append).
    expect(normalizeList(['other', 'rent'])).toEqual(['other', 'rent']);
    expect(normalizeList(['rent', 'other']).filter((x) => x === 'other')).toHaveLength(1);
  });

  it('returns just ["other"] for an empty input list', () => {
    expect(normalizeList([])).toEqual(['other']);
  });

  it('coerces non-string junk safely (null/undefined → dropped)', () => {
    // Cast because callers occasionally pass loosely-typed arrays.
    const input = ['rent', null, undefined, 0, 'fuel'] as unknown as string[];
    expect(normalizeList(input)).toEqual(['rent', 'fuel', 'other']);
  });
});

describe('resolveTaxonomy', () => {
  const fallback = ['a', 'b', 'c'];

  it('returns the override array when present and non-empty', () => {
    const overrides = { itemCategories: ['x', 'y'] };
    expect(resolveTaxonomy('itemCategories', overrides, fallback)).toEqual(['x', 'y']);
  });

  it('falls back when the key is absent', () => {
    expect(resolveTaxonomy('itemCategories', {}, fallback)).toBe(fallback);
  });

  it('falls back when overrides is undefined', () => {
    expect(resolveTaxonomy('itemCategories', undefined, fallback)).toBe(fallback);
  });

  it('falls back when the override is an empty array', () => {
    expect(resolveTaxonomy('itemCategories', { itemCategories: [] }, fallback)).toBe(fallback);
  });

  it('falls back when the override is not an array', () => {
    expect(resolveTaxonomy('itemCategories', { itemCategories: 'nope' }, fallback)).toBe(fallback);
    expect(resolveTaxonomy('itemCategories', { itemCategories: 42 }, fallback)).toBe(fallback);
  });

  it('coerces override members to strings', () => {
    const overrides = { expenseCategories: [1, 2, 'three'] };
    expect(resolveTaxonomy('expenseCategories', overrides, fallback)).toEqual(['1', '2', 'three']);
  });

  it('reads the requested key only (ignores sibling keys)', () => {
    const overrides = { itemCategories: ['ignored'] };
    expect(resolveTaxonomy('expenseCategories', overrides, fallback)).toBe(fallback);
  });
});

describe('defaults & metadata', () => {
  it('every default list already ends with "other"', () => {
    expect(DEFAULT_EXPENSE_CATEGORIES.at(-1)).toBe('other');
    expect(DEFAULT_ITEM_CATEGORIES.at(-1)).toBe('other');
    expect(DEFAULT_SUBSCRIPTION_CATEGORIES.at(-1)).toBe('other');
  });

  it('defaults survive normalizeList unchanged (already canonical)', () => {
    expect(normalizeList([...DEFAULT_EXPENSE_CATEGORIES])).toEqual(DEFAULT_EXPENSE_CATEGORIES);
    expect(normalizeList([...DEFAULT_ITEM_CATEGORIES])).toEqual(DEFAULT_ITEM_CATEGORIES);
    expect(normalizeList([...DEFAULT_SUBSCRIPTION_CATEGORIES])).toEqual(DEFAULT_SUBSCRIPTION_CATEGORIES);
  });

  it('TAXONOMY_META covers exactly the three taxonomy keys and wires the right defaults', () => {
    expect(TAXONOMY_META.map((m) => m.key)).toEqual([
      'expenseCategories',
      'itemCategories',
      'subscriptionCategories',
    ]);
    const byKey = Object.fromEntries(TAXONOMY_META.map((m) => [m.key, m.default]));
    expect(byKey.expenseCategories).toBe(DEFAULT_EXPENSE_CATEGORIES);
    expect(byKey.itemCategories).toBe(DEFAULT_ITEM_CATEGORIES);
    expect(byKey.subscriptionCategories).toBe(DEFAULT_SUBSCRIPTION_CATEGORIES);
  });

  it('TAXONOMY_META entries all carry a label and a where hint', () => {
    for (const m of TAXONOMY_META) {
      expect(m.label.length).toBeGreaterThan(0);
      expect(m.where.length).toBeGreaterThan(0);
    }
  });
});
