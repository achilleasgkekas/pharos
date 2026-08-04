import { describe, it, expect } from 'vitest';
import { splitFreshAlerts } from './alertDedup';

describe('splitFreshAlerts', () => {
  it('everything is fresh when the previous set is empty', () => {
    const { fresh, keys } = splitFreshAlerts(['a', 'b'], (x) => `k:${x}`, []);
    expect(fresh).toEqual(['a', 'b']);
    expect(keys).toEqual(['k:a', 'k:b']);
  });

  it('drops items whose key was already sent', () => {
    const { fresh } = splitFreshAlerts(['a', 'b', 'c'], (x) => `k:${x}`, ['k:a', 'k:c']);
    expect(fresh).toEqual(['b']);
  });

  it('a changed key (e.g. a moved due date baked into the key) counts as fresh again', () => {
    const items = [{ id: 1, due: '2026-09-01' }];
    const key = (i: (typeof items)[number]) => `bill:${i.id}:${i.due}`;
    const previouslySent = [key({ id: 1, due: '2026-08-01' })]; // same id, old due date
    const { fresh } = splitFreshAlerts(items, key, previouslySent);
    expect(fresh).toEqual(items);
  });

  it('an empty items array is fresh:[] with keys:[] regardless of the previous set', () => {
    expect(splitFreshAlerts([], () => 'x', ['x', 'y'])).toEqual({ fresh: [], keys: [] });
  });

  it('accepts a Set directly (no Array.from needed at the call site)', () => {
    const { fresh } = splitFreshAlerts(['a', 'b'], (x) => x, new Set(['a']));
    expect(fresh).toEqual(['b']);
  });

  it('keys always reflects every current item, fresh or not (the next baseline)', () => {
    const { keys } = splitFreshAlerts(['a', 'b', 'c'], (x) => x, ['a', 'c']);
    expect(keys).toEqual(['a', 'b', 'c']);
  });

  it('duplicate keys across items are preserved in keys but only filtered once', () => {
    const { fresh, keys } = splitFreshAlerts(['a', 'a'], (x) => x, ['a']);
    expect(fresh).toEqual([]);
    expect(keys).toEqual(['a', 'a']);
  });
});
