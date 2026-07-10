import { describe, it, expect } from 'vitest';
import { pickWorkspace, normalizeSlug, workspaceQuery } from './chooseWorkspace';

const ws = (slug: string) => ({ slug, name: slug });

describe('normalizeSlug', () => {
  it('trims + lowercases strings', () => {
    expect(normalizeSlug('  Acme-Co  ')).toBe('acme-co');
  });
  it('returns "" for non-strings', () => {
    expect(normalizeSlug(null)).toBe('');
    expect(normalizeSlug(42)).toBe('');
    expect(normalizeSlug(undefined)).toBe('');
  });
});

describe('pickWorkspace', () => {
  const tenants = [ws('acme'), ws('globex'), ws('initech')];

  it('returns null for no memberships', () => {
    expect(pickWorkspace([], null)).toBeNull();
    expect(pickWorkspace([], 'acme')).toBeNull();
  });

  it('defaults to the first membership when no want slug', () => {
    expect(pickWorkspace(tenants, null)?.slug).toBe('acme');
    expect(pickWorkspace(tenants, '')).toBe(tenants[0]);
    expect(pickWorkspace(tenants, '   ')?.slug).toBe('acme');
  });

  it('selects by slug case-insensitively', () => {
    expect(pickWorkspace(tenants, 'globex')?.slug).toBe('globex');
    expect(pickWorkspace(tenants, ' INITECH ')?.slug).toBe('initech');
  });

  it('returns null when a given slug matches no membership', () => {
    expect(pickWorkspace(tenants, 'nope')).toBeNull();
  });

  it('ignores a non-string want and defaults to first', () => {
    expect(pickWorkspace(tenants, 123 as unknown)?.slug).toBe('acme');
  });
});

describe('workspaceQuery', () => {
  it('is empty for the default workspace', () => {
    expect(workspaceQuery('acme', true)).toBe('');
  });
  it('is empty for a blank slug', () => {
    expect(workspaceQuery('', false)).toBe('');
    expect(workspaceQuery(null, false)).toBe('');
  });
  it('builds ?w=<slug> for a non-default workspace', () => {
    expect(workspaceQuery('globex', false)).toBe('?w=globex');
  });
  it('url-encodes the slug', () => {
    expect(workspaceQuery('a b', false)).toBe('?w=a%20b');
  });
});
