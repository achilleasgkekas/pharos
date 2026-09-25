import { describe, expect, it } from 'vitest';
import { matchesSpace, NO_SPACE, spaceFilterOptions } from './spaceFilter';

describe('matchesSpace (#146)', () => {
  it('no filter matches everything', () => {
    expect(matchesSpace('Kalamos', '')).toBe(true);
    expect(matchesSpace('', '')).toBe(true);
    expect(matchesSpace(undefined, '')).toBe(true);
  });

  it('a named space matches only that space', () => {
    expect(matchesSpace('Kalamos', 'Kalamos')).toBe(true);
    expect(matchesSpace('Athens', 'Kalamos')).toBe(false);
    expect(matchesSpace('', 'Kalamos')).toBe(false);
  });

  it('"no space" matches only untagged records', () => {
    expect(matchesSpace('', NO_SPACE)).toBe(true);
    expect(matchesSpace(null, NO_SPACE)).toBe(true);
    expect(matchesSpace(undefined, NO_SPACE)).toBe(true);
    expect(matchesSpace('Kalamos', NO_SPACE)).toBe(false);
  });
});

describe('spaceFilterOptions', () => {
  it('lists the spaces then "no space", or nothing when no space is named (filter hidden)', () => {
    expect(spaceFilterOptions(['Athens', 'Kalamos'])).toEqual(['Athens', 'Kalamos', NO_SPACE]);
    expect(spaceFilterOptions([])).toEqual([]);
  });
});
