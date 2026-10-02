import { describe, it, expect } from 'vitest';
import { ALL_CATEGORIES, CATEGORY_GROUPS, CATEGORY_ALIASES, canonicalCategory, categoryGroup, groupCategories, withCustomCategories, INCOME_CATEGORIES } from './categories';

describe('the shared category list', () => {
  it('has ten groups and no category in two of them', () => {
    expect(CATEGORY_GROUPS).toHaveLength(10);
    expect(new Set(ALL_CATEGORIES).size).toBe(ALL_CATEGORIES.length);
    expect(ALL_CATEGORIES.at(-1)).toBe('other');
  });
  it('keeps every value the old default lists used', () => {
    for (const c of ['rent', 'utilities', 'fuel', 'salary', 'insurance', 'telecom', 'groceries', 'transport', 'health', 'tax', 'subscription', 'other', 'streaming', 'cloud', 'software', 'gaming', 'news', 'fitness', 'card-payment', 'uncategorized']) {
      expect(ALL_CATEGORIES).toContain(c);
    }
  });
  it('points every alias at a built-in category', () => {
    for (const target of Object.values(CATEGORY_ALIASES)) expect(ALL_CATEGORIES).toContain(target);
    for (const c of INCOME_CATEGORIES) expect(ALL_CATEGORIES).toContain(c);
  });
});

describe('canonicalCategory / categoryGroup', () => {
  it('reads old spellings as the category they mean', () => {
    expect(canonicalCategory('Food')).toBe('groceries');
    expect(canonicalCategory(' Super Market ')).toBe('super-market');
    expect(canonicalCategory('supermarket')).toBe('groceries');
    expect(canonicalCategory('')).toBe('other');
    expect(categoryGroup('electric').key).toBe('bills');
    expect(categoryGroup('fuel').key).toBe('transport');
  });
  it('puts unknown and custom categories under Other', () => {
    expect(categoryGroup('boat-club').key).toBe('other');
    expect(categoryGroup(null).key).toBe('other');
  });
});

describe('withCustomCategories / groupCategories', () => {
  it('adds custom ones after the built-in list, once', () => {
    expect(withCustomCategories(['rent', 'Boat Club', 'boat-club', 'food'])).toEqual([...ALL_CATEGORIES, 'boat-club']);
  });
  it('groups a list in group order, custom ones under Other', () => {
    const g = groupCategories(['fuel', 'rent', 'boat-club', 'groceries', 'food']);
    expect(g.map((x) => x.group.key)).toEqual(['home', 'food', 'transport', 'other']);
    expect(g.find((x) => x.group.key === 'food')?.categories).toEqual(['groceries']);
    expect(g.at(-1)?.categories).toEqual(['boat-club']);
  });
});

describe('names', () => {
  it('every category and group has a name in every language', async () => {
    for (const loc of ['en', 'el', 'de', 'es', 'fr', 'it', 'nl', 'pt']) {
      const mod = (await import(`./i18n/locales/${loc}.ts`)) as Record<string, Record<string, string>>;
      const dict = Object.values(mod).find((v) => v && typeof v === 'object' && 'nav.home' in v) as Record<string, string>;
      for (const c of ALL_CATEGORIES) expect(dict[`cat.${c}`], `${loc} cat.${c}`).toBeTruthy();
      for (const g of CATEGORY_GROUPS) expect(dict[`catg.${g.key}`], `${loc} catg.${g.key}`).toBeTruthy();
    }
  });
});
