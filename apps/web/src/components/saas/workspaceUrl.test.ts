import { describe, it, expect } from 'vitest';
import { workspaceUrl } from './workspaceUrl';

// This helper exists because there was no link from the account area into the product at all: a
// customer finished signup, landed in workspace settings, and had no way into Pharos. So the
// cases that matter are the ones that would produce a link that LOOKS fine and goes nowhere.

describe('workspaceUrl', () => {
  it('swaps the app label for the workspace slug', () => {
    expect(workspaceUrl('home', 'https://app.ph-aros.com')).toBe('https://home.ph-aros.com');
  });

  it('keeps the port, which is the whole reason it derives from the base URL', () => {
    // Assembling 'https://' + slug + '.' + domain drops the port, and the link 404s on an apex
    // that is not even listening there.
    expect(workspaceUrl('acme', 'http://app.lvh.me:3001')).toBe('http://acme.lvh.me:3001');
  });

  it('PREPENDS rather than replaces when the host has no leading label to give up', () => {
    // 'lvh.me' has only two labels; replacing the first would produce 'acme.me' and send the user
    // to a domain we do not own.
    expect(workspaceUrl('acme', 'http://lvh.me:3001')).toBe('http://acme.lvh.me:3001');
    expect(workspaceUrl('acme', 'https://ph-aros.com')).toBe('https://acme.ph-aros.com');
  });

  it('always lands on the workspace root, never on a path from the base url', () => {
    expect(workspaceUrl('home', 'https://app.ph-aros.com/account/workspace?w=home#x')).toBe(
      'https://home.ph-aros.com',
    );
  });

  it('normalises the slug the same way the tenant resolver does', () => {
    expect(workspaceUrl('  HOME  ', 'https://app.ph-aros.com')).toBe('https://home.ph-aros.com');
  });

  it.each([
    ['', 'https://app.ph-aros.com'],
    ['home', ''],
    ['home', null],
    ['home', 'not a url'],
  ])('falls back to a relative root for (%s, %s) instead of a broken absolute link', (slug, base) => {
    // A relative link keeps the user on the host they are already on: wrong but harmless. A
    // malformed absolute one sends them off-site.
    expect(workspaceUrl(slug, base as string | null)).toBe('/');
  });
});
