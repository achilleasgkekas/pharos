import { describe, it, expect } from 'vitest';
import { ROLES, parseRole, atLeast, canWrite, canAdmin, isReadMethod } from './roles';

// The whole point of P31 is that a read-only role is real, so these tests pin the
// fail-closed direction as hard as the happy path: anything unrecognised must lose
// privileges, never gain them.

describe('parseRole', () => {
  it('accepts exactly the three known roles', () => {
    expect(ROLES).toEqual(['viewer', 'member', 'admin']);
    for (const r of ROLES) expect(parseRole(r)).toBe(r);
  });

  it('rejects anything else, including near-misses and non-strings', () => {
    for (const x of ['owner', 'Admin', 'ADMIN', '', ' member', null, undefined, 3, {}]) {
      expect(parseRole(x)).toBeNull();
    }
  });
});

describe('canWrite', () => {
  it('lets admins and members change things', () => {
    expect(canWrite('admin')).toBe(true);
    expect(canWrite('member')).toBe(true);
  });

  it('does not let a viewer change anything', () => {
    expect(canWrite('viewer')).toBe(false);
  });

  it('treats an unknown or corrupt role as read-only', () => {
    for (const x of ['', 'owner', 'Member', 'root', 'undefined']) expect(canWrite(x)).toBe(false);
  });
});

describe('canAdmin', () => {
  it('is admin-only, so a member cannot reach settings or users', () => {
    expect(canAdmin('admin')).toBe(true);
    expect(canAdmin('member')).toBe(false);
    expect(canAdmin('viewer')).toBe(false);
    expect(canAdmin('nonsense')).toBe(false);
  });
});

describe('atLeast', () => {
  it('orders viewer < member < admin', () => {
    expect(atLeast('admin', 'viewer')).toBe(true);
    expect(atLeast('member', 'viewer')).toBe(true);
    expect(atLeast('viewer', 'viewer')).toBe(true);
    expect(atLeast('viewer', 'member')).toBe(false);
    expect(atLeast('member', 'admin')).toBe(false);
  });
});

describe('isReadMethod', () => {
  it('counts only the safe verbs as reads, case-insensitively', () => {
    for (const m of ['GET', 'get', 'HEAD', 'OPTIONS']) expect(isReadMethod(m)).toBe(true);
  });

  it('treats every other verb, including an unexpected one, as a mutation', () => {
    for (const m of ['POST', 'PUT', 'PATCH', 'DELETE', 'purge', '', 'TRACE']) {
      expect(isReadMethod(m)).toBe(false);
    }
  });
});
