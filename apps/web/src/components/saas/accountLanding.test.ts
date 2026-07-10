import { describe, it, expect } from 'vitest';
import { accountLanding, type LandingTenant } from './accountLanding';

const ws = (slug: string): LandingTenant => ({
  slug,
  name: `${slug} inc`,
  role: 'owner',
  plan: 'pro',
  status: 'active',
});

describe('accountLanding', () => {
  it('empty membership list → empty', () => {
    expect(accountLanding([])).toEqual({ kind: 'empty' });
  });

  it('non-array input → empty (defensive, no throw)', () => {
    // @ts-expect-error deliberately passing a bad value
    expect(accountLanding(null)).toEqual({ kind: 'empty' });
    // @ts-expect-error deliberately passing a bad value
    expect(accountLanding(undefined)).toEqual({ kind: 'empty' });
  });

  it('exactly one workspace → single with its slug', () => {
    expect(accountLanding([ws('acme')])).toEqual({ kind: 'single', slug: 'acme' });
  });

  it('single workspace with missing slug → single with empty slug', () => {
    const t = { name: 'x', role: 'owner', plan: 'free', status: 'active' } as unknown as LandingTenant;
    expect(accountLanding([t])).toEqual({ kind: 'single', slug: '' });
  });

  it('two or more workspaces → choose, preserving order', () => {
    const list = [ws('acme'), ws('globex'), ws('initech')];
    const d = accountLanding(list);
    expect(d.kind).toBe('choose');
    if (d.kind === 'choose') {
      expect(d.workspaces.map((w) => w.slug)).toEqual(['acme', 'globex', 'initech']);
    }
  });

  it('choose returns a copy, not the same array reference', () => {
    const list = [ws('a'), ws('b')];
    const d = accountLanding(list);
    if (d.kind === 'choose') {
      expect(d.workspaces).not.toBe(list);
      expect(d.workspaces).toEqual(list);
    }
  });
});
