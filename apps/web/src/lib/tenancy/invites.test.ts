import { describe, it, expect } from 'vitest';
import {
  INVITE_TTL_MS,
  inviteTokenExpiry,
  isInviteValid,
  hashInviteToken,
  mintInviteToken,
  inviteHashMatches,
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
