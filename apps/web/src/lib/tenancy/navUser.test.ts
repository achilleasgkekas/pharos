import { describe, it, expect } from 'vitest';
import { navRole } from './navUser';

// The navbar vanished entirely for hosted customers because the layout keyed off the self-hosted
// `User`, which does not exist in SaaS mode. navRole is the pure half of the fix.
describe('navRole', () => {
  it('maps owner and admin to admin, the closest true statement', () => {
    expect(navRole('owner')).toBe('admin');
    expect(navRole('admin')).toBe('admin');
  });

  it('maps member to member', () => {
    expect(navRole('member')).toBe('member');
  });

  it.each([undefined, '', 'nonsense', 'OWNER '])('falls back to viewer for %s', (r) => {
    // Least privilege on anything unrecognised. The trailing-space case is not pedantry: this
    // string comes from a stored membership, and inventing a role from a typo would print a
    // claim the server would not honour.
    expect(navRole(r as string | undefined)).toBe(r === 'OWNER ' ? 'viewer' : 'viewer');
  });

  it('is case-insensitive for the values we do recognise', () => {
    expect(navRole('Owner')).toBe('admin');
    expect(navRole('MEMBER')).toBe('member');
  });
});
