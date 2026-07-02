import { describe, it, expect } from 'vitest';
import {
  parseRole,
  canManageMembers,
  canAssignRole,
  activeOwners,
  wouldOrphanOwners,
  normalizeEmail,
  looksLikeEmail,
  ORG_ROLES,
  type MemberLite,
} from './members';

// Only the PURE helpers are unit-tested. The route handlers + node-only
// resolveWorkspaceSession are SaaS-gated (404 when SAAS_MODE off); their authz shape is
// asserted here through canManageMembers/canAssignRole/wouldOrphanOwners.

describe('parseRole', () => {
  it('accepts the three valid roles', () => {
    for (const r of ORG_ROLES) expect(parseRole(r)).toBe(r);
  });
  it('rejects anything else', () => {
    expect(parseRole('superuser')).toBeNull();
    expect(parseRole('')).toBeNull();
    expect(parseRole(undefined)).toBeNull();
    expect(parseRole(42)).toBeNull();
    expect(parseRole(null)).toBeNull();
  });
});

describe('canManageMembers', () => {
  it('owner and admin can manage', () => {
    expect(canManageMembers('owner')).toBe(true);
    expect(canManageMembers('admin')).toBe(true);
  });
  it('member and unknown cannot', () => {
    expect(canManageMembers('member')).toBe(false);
    expect(canManageMembers('viewer')).toBe(false);
    expect(canManageMembers('')).toBe(false);
  });
});

describe('canAssignRole', () => {
  it('only an owner may assign the owner role', () => {
    expect(canAssignRole('owner', 'owner')).toBe(true);
    expect(canAssignRole('admin', 'owner')).toBe(false);
    expect(canAssignRole('member', 'owner')).toBe(false);
  });
  it('owner/admin may assign admin and member', () => {
    expect(canAssignRole('owner', 'admin')).toBe(true);
    expect(canAssignRole('owner', 'member')).toBe(true);
    expect(canAssignRole('admin', 'admin')).toBe(true);
    expect(canAssignRole('admin', 'member')).toBe(true);
  });
  it('a plain member may assign nothing', () => {
    expect(canAssignRole('member', 'member')).toBe(false);
    expect(canAssignRole('member', 'admin')).toBe(false);
  });
});

describe('activeOwners / wouldOrphanOwners', () => {
  const members: MemberLite[] = [
    { accountId: 'a', role: 'owner', status: 'active' },
    { accountId: 'b', role: 'admin', status: 'active' },
    { accountId: 'c', role: 'member', status: 'active' },
    { accountId: 'd', role: 'owner', status: 'removed' }, // removed owner doesn't count
  ];

  it('counts only active owners', () => {
    expect(activeOwners(members).map((m) => m.accountId)).toEqual(['a']);
  });

  it('removing the sole active owner would orphan the workspace', () => {
    expect(wouldOrphanOwners(members, 'a')).toBe(true);
  });

  it('removing a non-owner never orphans', () => {
    expect(wouldOrphanOwners(members, 'b')).toBe(false);
    expect(wouldOrphanOwners(members, 'c')).toBe(false);
  });

  it('removing one of two owners is fine', () => {
    const two: MemberLite[] = [
      { accountId: 'a', role: 'owner', status: 'active' },
      { accountId: 'e', role: 'owner', status: 'active' },
    ];
    expect(wouldOrphanOwners(two, 'a')).toBe(false);
    expect(wouldOrphanOwners(two, 'e')).toBe(false);
  });

  it('a removed owner as target does not count as orphaning', () => {
    expect(wouldOrphanOwners(members, 'd')).toBe(false);
  });
});

describe('normalizeEmail / looksLikeEmail', () => {
  it('lowercases and trims', () => {
    expect(normalizeEmail('  Foo@Bar.COM ')).toBe('foo@bar.com');
    expect(normalizeEmail(123)).toBe('');
    expect(normalizeEmail(undefined)).toBe('');
  });
  it('validates shape', () => {
    expect(looksLikeEmail('a@b.co')).toBe(true);
    expect(looksLikeEmail('no-at')).toBe(false);
    expect(looksLikeEmail('a@b')).toBe(false);
    expect(looksLikeEmail('a b@c.com')).toBe(false);
    expect(looksLikeEmail('')).toBe(false);
  });
});
