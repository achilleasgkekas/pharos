import { describe, expect, it } from 'vitest';
import { matchesListSearch } from './search';

// #408: adding "Bread" while searching "Apples" kept the search, so the saved item looked lost.
describe('matchesListSearch', () => {
  it('matches everything on a blank search', () => {
    expect(matchesListSearch({ name: 'Bread' }, '')).toBe(true);
    expect(matchesListSearch({ name: 'Bread' }, '   ')).toBe(true);
  });

  it('matches name, brand or category, ignoring case and surrounding spaces', () => {
    expect(matchesListSearch({ name: 'Green Apples' }, ' apples ')).toBe(true);
    expect(matchesListSearch({ name: 'Milk', brand: 'Δέλτα' }, 'δέλτα')).toBe(true);
    expect(matchesListSearch({ name: 'Milk', category: 'Dairy' }, 'dairy')).toBe(true);
  });

  it('does not match an item the search would hide', () => {
    expect(matchesListSearch({ name: 'Bread', brand: '', category: null }, 'Apples')).toBe(false);
  });
});
