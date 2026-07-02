import { describe, it, expect } from 'vitest';
import {
  INVITE_TTL_MS,
  inviteTokenExpiry,
  isInviteValid,
  hashInviteToken,
  mintInviteToken,
  inviteHashMatches,
  inviteView,
  parseInviteStatusFilter,
  inviteStatusQuery,
  collectInviteAccountIds,
} from './invites';

// The pure + crypto helpers are unit-tested. The mint (members POST) and accept route
// handlers are SaaS-gated (404 when SAAS_MODE off). Their token lifecycle (mint → store
// hash → look up by hash → expire/consume) is asserted here through these helpers.

describe('INVITE_TTL_MS', () => {
  it('is 7 days — longer than reset (1h) and verify (24h)', () => {
    expect(INVITE_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });
});

describe('inviteTokenExpiry', () => {
  it('is INVITE_TTL_MS ahead of the given now', () => {
    const now = 2_000_000;
    expect(inviteTokenExpiry(now).getTime()).toBe(now + INVITE_TTL_MS);
  });
});

describe('isInviteValid', () => {
  const now = 1_000_000;
  it('true only for a pending invite with a future expiry', () => {
    expect(isInviteValid('pending', new Date(now + 1000), now)).toBe(true);
  });
  it('false for a past expiry', () => {
    expect(isInviteValid('pending', new Date(now - 1), now)).toBe(false);
  });
  it('false for a non-pending status even when unexpired', () => {
    expect(isInviteValid('accepted', new Date(now + 1000), now)).toBe(false);
    expect(isInviteValid('revoked', new Date(now + 1000), now)).toBe(false);
  });
  it('false for null/undefined status or expiry', () => {
    expect(isInviteValid(null, new Date(now + 1000), now)).toBe(false);
    expect(isInviteValid('pending', null, now)).toBe(false);
    expect(isInviteValid('pending', undefined, now)).toBe(false);
  });
  it('accepts an ISO string expiry', () => {
    expect(isInviteValid('pending', new Date(now + 5000).toISOString(), now)).toBe(true);
  });
  it('false for an unparseable expiry', () => {
    expect(isInviteValid('pending', 'not-a-date', now)).toBe(false);
  });
});

describe('hashInviteToken', () => {
  it('is deterministic, 64 hex chars, and distinct per token', () => {
    const a = hashInviteToken('alpha');
    expect(a).toBe(hashInviteToken('alpha'));
    expect(a).toMatch(/^[a-f0-9]{64}$/);
    expect(a).not.toBe(hashInviteToken('beta'));
  });
});

describe('mintInviteToken', () => {
  it('returns a token whose hash matches hashInviteToken, with the right expiry', () => {
    const now = 3_000_000;
    const { token, tokenHash, expires } = mintInviteToken(now);
    expect(tokenHash).toBe(hashInviteToken(token));
    expect(expires.getTime()).toBe(now + INVITE_TTL_MS);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/); // base64url, no padding
  });
  it('mints a distinct token each call', () => {
    expect(mintInviteToken().token).not.toBe(mintInviteToken().token);
  });
});

describe('inviteHashMatches', () => {
  it('true for identical hex strings', () => {
    const h = hashInviteToken('x');
    expect(inviteHashMatches(h, h)).toBe(true);
  });
  it('false for different or length-mismatched hashes, no throw', () => {
    expect(inviteHashMatches(hashInviteToken('x'), hashInviteToken('y'))).toBe(false);
    expect(inviteHashMatches('abc', 'abcd')).toBe(false);
    expect(inviteHashMatches(null, 'abc')).toBe(false);
    expect(inviteHashMatches('abc', undefined)).toBe(false);
  });
});

describe('inviteView', () => {
  const now = 10_000_000;
  const future = new Date(now + INVITE_TTL_MS);
  const past = new Date(now - 1000);

  it('projects the manager-facing fields and stringifies the id', () => {
    const v = inviteView(
      { _id: 42, email: 'a@b.com', role: 'admin', status: 'pending', expires: future, createdAt: new Date(now) },
      now
    );
    expect(v.id).toBe('42');
    expect(v.email).toBe('a@b.com');
    expect(v.role).toBe('admin');
    expect(v.status).toBe('pending');
    expect(v.expires).toBe(future.toISOString());
    expect(v.createdAt).toBe(new Date(now).toISOString());
  });

  it('never leaks the token hash or unknown fields', () => {
    const v = inviteView(
      { _id: 'x', email: 'a@b.com', role: 'member', status: 'pending', expires: future, tokenHash: 'SECRET' } as never,
      now
    );
    expect(JSON.stringify(v)).not.toContain('SECRET');
    expect(Object.keys(v).sort()).toEqual(
      [
        'acceptedAt',
        'acceptedBy',
        'accepterEmail',
        'accepterName',
        'createdAt',
        'email',
        'expired',
        'expires',
        'id',
        'invitedBy',
        'inviterEmail',
        'inviterName',
        'role',
        'status',
      ].sort()
    );
  });

  it('defaults resolved identities to null when the route passes none', () => {
    const v = inviteView({ _id: 1, status: 'pending', expires: future, invitedBy: 7 }, now);
    expect(v.inviterEmail).toBeNull();
    expect(v.inviterName).toBeNull();
    expect(v.accepterEmail).toBeNull();
    expect(v.accepterName).toBeNull();
  });

  it('projects resolved inviter/accepter identities from the 3rd arg', () => {
    const v = inviteView(
      { _id: 1, status: 'accepted', expires: future, invitedBy: 7, acceptedBy: 99, acceptedAt: new Date(now) },
      now,
      {
        inviterEmail: 'owner@b.com',
        inviterName: 'Owner',
        accepterEmail: 'joiner@b.com',
        accepterName: 'Joiner',
      }
    );
    expect(v.inviterEmail).toBe('owner@b.com');
    expect(v.inviterName).toBe('Owner');
    expect(v.accepterEmail).toBe('joiner@b.com');
    expect(v.accepterName).toBe('Joiner');
  });

  it('projects acceptance audit fields on an accepted invite', () => {
    const acceptedAt = new Date(now + 5000);
    const v = inviteView(
      { _id: 1, status: 'accepted', expires: future, acceptedBy: 99, acceptedAt },
      now
    );
    expect(v.acceptedBy).toBe('99');
    expect(v.acceptedAt).toBe(acceptedAt.toISOString());
  });

  it('leaves acceptance fields null on a not-yet-accepted invite', () => {
    const v = inviteView({ _id: 1, status: 'pending', expires: future }, now);
    expect(v.acceptedBy).toBeNull();
    expect(v.acceptedAt).toBeNull();
  });

  it('projects invitedBy (the minter) as a stringified id', () => {
    const v = inviteView({ _id: 1, status: 'pending', expires: future, invitedBy: 7 }, now);
    expect(v.invitedBy).toBe('7');
  });

  it('leaves invitedBy null on a legacy row minted before the field existed', () => {
    const v = inviteView({ _id: 1, status: 'pending', expires: future }, now);
    expect(v.invitedBy).toBeNull();
  });

  it('flags a pending invite past its TTL as expired', () => {
    expect(inviteView({ _id: 1, status: 'pending', expires: past }, now).expired).toBe(true);
    expect(inviteView({ _id: 1, status: 'pending', expires: future }, now).expired).toBe(false);
  });

  it('a non-pending invite is never marked expired', () => {
    expect(inviteView({ _id: 1, status: 'accepted', expires: past }, now).expired).toBe(false);
    expect(inviteView({ _id: 1, status: 'revoked', expires: past }, now).expired).toBe(false);
  });

  it('accepts ISO-string dates and null expiry safely', () => {
    const v = inviteView({ _id: 1, status: 'pending', expires: future.toISOString() }, now);
    expect(v.expires).toBe(future.toISOString());
    const n = inviteView({ _id: 1, status: 'pending', expires: null }, now);
    expect(n.expires).toBeNull();
    expect(n.expired).toBe(true); // no expiry → not redeemable
  });

  it('fills sensible defaults for missing optional fields', () => {
    const v = inviteView({ _id: 7 }, now);
    expect(v.email).toBe('');
    expect(v.role).toBe('member');
    expect(v.status).toBe('pending');
    expect(v.createdAt).toBeNull();
    expect(v.invitedBy).toBeNull();
    expect(v.acceptedBy).toBeNull();
    expect(v.acceptedAt).toBeNull();
  });
});

describe('collectInviteAccountIds', () => {
  it('collects distinct stringified ids across invitedBy and acceptedBy', () => {
    const ids = collectInviteAccountIds([
      { invitedBy: 7, acceptedBy: 99 },
      { invitedBy: 7 }, // duplicate inviter → deduped
      { acceptedBy: 42 },
    ]);
    expect(ids.sort()).toEqual(['42', '7', '99'].sort());
  });

  it('drops null/undefined fields and returns empty for legacy/empty rows', () => {
    expect(collectInviteAccountIds([{ invitedBy: null, acceptedBy: undefined }, {}])).toEqual([]);
    expect(collectInviteAccountIds([])).toEqual([]);
  });
});

describe('parseInviteStatusFilter', () => {
  it('defaults to pending for missing/empty/unknown input (backward compatible)', () => {
    expect(parseInviteStatusFilter(null)).toBe('pending');
    expect(parseInviteStatusFilter(undefined)).toBe('pending');
    expect(parseInviteStatusFilter('')).toBe('pending');
    expect(parseInviteStatusFilter('   ')).toBe('pending');
    expect(parseInviteStatusFilter('bogus')).toBe('pending');
  });

  it('accepts the three concrete statuses plus all', () => {
    expect(parseInviteStatusFilter('pending')).toBe('pending');
    expect(parseInviteStatusFilter('accepted')).toBe('accepted');
    expect(parseInviteStatusFilter('revoked')).toBe('revoked');
    expect(parseInviteStatusFilter('all')).toBe('all');
  });

  it('is case-insensitive and trims surrounding whitespace', () => {
    expect(parseInviteStatusFilter(' ALL ')).toBe('all');
    expect(parseInviteStatusFilter('Accepted')).toBe('accepted');
    expect(parseInviteStatusFilter('REVOKED')).toBe('revoked');
  });
});

describe('inviteStatusQuery', () => {
  it('all → no status constraint', () => {
    expect(inviteStatusQuery('all')).toEqual({});
  });

  it('a concrete status → that status constraint', () => {
    expect(inviteStatusQuery('pending')).toEqual({ status: 'pending' });
    expect(inviteStatusQuery('accepted')).toEqual({ status: 'accepted' });
    expect(inviteStatusQuery('revoked')).toEqual({ status: 'revoked' });
  });
});
