import { describe, expect, it } from 'vitest';
import {
  resolveCategoryRules,
  matchCategoryRule,
  categoryFromRules,
  type CategoryRule,
} from './categoryRules';

function rule(partial: Partial<CategoryRule>): CategoryRule {
  return {
    id: 'x',
    match: 'dei',
    matchType: 'vendor',
    category: 'utilities',
    recurring: false,
    recurringCycle: '',
    ...partial,
  };
}

describe('resolveCategoryRules', () => {
  it('returns [] for non-array / junk input', () => {
    expect(resolveCategoryRules(null)).toEqual([]);
    expect(resolveCategoryRules(undefined)).toEqual([]);
    expect(resolveCategoryRules('nope')).toEqual([]);
    expect(resolveCategoryRules({})).toEqual([]);
  });

  it('drops entries missing match or category', () => {
    const out = resolveCategoryRules([
      { match: 'dei', category: 'utilities' },
      { match: '', category: 'utilities' },
      { match: 'x', category: '' },
      { category: 'no-match' },
      null,
      42,
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].match).toBe('dei');
  });

  it('defaults matchType to vendor and coerces an invalid cycle to empty', () => {
    const out = resolveCategoryRules([
      { match: 'netflix', category: 'entertainment', matchType: 'nonsense', recurring: true, recurringCycle: 'daily' },
    ]);
    expect(out[0].matchType).toBe('vendor');
    expect(out[0].recurring).toBe(true);
    expect(out[0].recurringCycle).toBe('');
  });

  it('keeps a valid cycle and text matchType', () => {
    const out = resolveCategoryRules([
      { match: 'rent', category: 'rent', matchType: 'text', recurring: true, recurringCycle: 'monthly' },
    ]);
    expect(out[0].matchType).toBe('text');
    expect(out[0].recurringCycle).toBe('monthly');
  });

  it('trims and caps match/category length', () => {
    const out = resolveCategoryRules([{ match: `  ${'a'.repeat(200)}  `, category: `  ${'b'.repeat(200)}  ` }]);
    expect(out[0].match).toHaveLength(80);
    expect(out[0].category).toHaveLength(60);
  });

  it('generates a stable id when absent but preserves a provided one', () => {
    const [a] = resolveCategoryRules([{ match: 'dei', category: 'utilities' }]);
    expect(a.id).toBeTruthy();
    const [b] = resolveCategoryRules([{ id: 'keep-me', match: 'dei', category: 'utilities' }]);
    expect(b.id).toBe('keep-me');
  });
});

describe('matchCategoryRule — vendor mode', () => {
  it('matches accent/spacing/case-insensitively via vendorKey normalization', () => {
    const rules = [rule({ match: 'ΔΕΗ', category: 'utilities' })];
    expect(matchCategoryRule(rules, { vendor: 'δεη' })?.category).toBe('utilities');
    expect(matchCategoryRule(rules, { vendor: 'PPC / ΔΕΗ Α.Ε.' })?.category).toBe('utilities');
  });

  it('matches on containment, not exact equality', () => {
    const rules = [rule({ match: 'cosmote', category: 'utilities' })];
    expect(matchCategoryRule(rules, { vendor: 'COSMOTE Fixed' })?.category).toBe('utilities');
  });

  it('does not match an unrelated vendor', () => {
    const rules = [rule({ match: 'cosmote', category: 'utilities' })];
    expect(matchCategoryRule(rules, { vendor: 'Netflix' })).toBeNull();
  });

  it('returns the FIRST matching rule when several match', () => {
    const rules = [
      rule({ id: '1', match: 'a', category: 'first' }),
      rule({ id: '2', match: 'a', category: 'second' }),
    ];
    expect(matchCategoryRule(rules, { vendor: 'aaa' })?.category).toBe('first');
  });

  it('returns null for an empty rule list', () => {
    expect(matchCategoryRule([], { vendor: 'anything' })).toBeNull();
  });
});

describe('matchCategoryRule — text mode', () => {
  it('matches a substring in vendor + description, case-insensitively', () => {
    const rules = [rule({ match: 'gym membership', matchType: 'text', category: 'health' })];
    expect(matchCategoryRule(rules, { vendor: 'Bank', description: 'GYM MEMBERSHIP monthly' })?.category).toBe('health');
  });

  it('does not match when the phrase is absent', () => {
    const rules = [rule({ match: 'gym membership', matchType: 'text', category: 'health' })];
    expect(matchCategoryRule(rules, { vendor: 'Bank', description: 'grocery run' })).toBeNull();
  });
});

describe('categoryFromRules', () => {
  it('returns category + recurring hints for a match', () => {
    const rules = [rule({ match: 'netflix', category: 'entertainment', recurring: true, recurringCycle: 'monthly' })];
    expect(categoryFromRules(rules, { vendor: 'Netflix' })).toEqual({
      category: 'entertainment',
      recurring: true,
      recurringCycle: 'monthly',
    });
  });

  it('returns null when nothing matches', () => {
    const rules = [rule({ match: 'netflix', category: 'entertainment' })];
    expect(categoryFromRules(rules, { vendor: 'Spotify' })).toBeNull();
  });
});
