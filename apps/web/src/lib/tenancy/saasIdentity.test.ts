import { describe, it, expect } from 'vitest';
import { navRole } from './saasIdentity';

// The bridge between the two identity systems. Without it, a signed-in hosted customer looked
// like nobody: every gate redirected to /login, /login saw zero self-hosted User documents and
// redirected to /setup, and the customer was handed "create your admin account" inside their own
// workspace. navRole is the pure half.
describe('navRole', () => {
  it('maps owner and admin to admin', () => {
    expect(navRole('owner')).toBe('admin');
    expect(navRole('admin')).toBe('admin');
  });

  it('maps member to member', () => {
    expect(navRole('member')).toBe('member');
  });

  it.each([undefined, '', 'nonsense', 'OWNER ', 'root', 'superuser'])(
    'falls back to viewer (least privilege) for %s',
    (r) => {
      // This value now gates requireAdmin, so an unrecognised string must NEVER open a door.
      // 'OWNER ' with a trailing space is the realistic version: it comes from stored data.
      expect(navRole(r as string | undefined)).toBe('viewer');
    },
  );

  it('is case-insensitive for the values it does recognise', () => {
    expect(navRole('Owner')).toBe('admin');
    expect(navRole('MEMBER')).toBe('member');
  });
});
