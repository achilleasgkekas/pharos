import { describe, it, expect } from 'vitest';
import {
  VERIFY_TTL_MS,
  verifyTokenExpiry,
  isVerifyTokenValid,
  hashVerifyToken,
  mintVerifyToken,
  verifyHashMatches,
} from './emailVerify';

// The pure + crypto helpers are unit-tested. The request/confirm route handlers are
// SaaS-gated (404 when SAAS_MODE off); the request route is authenticated and the confirm
// route is token-based. Their token lifecycle (mint → store hash → look up → expire) is
// asserted here through these helpers.

describe('verifyTokenExpiry', () => {
  it('is VERIFY_TTL_MS ahead of the given now', () => {
    const now = 1_000_000;
    expect(verifyTokenExpiry(now).getTime()).toBe(now + VERIFY_TTL_MS);
  });
  it('uses a 24-hour window', () => {
    expect(VERIFY_TTL_MS).toBe(24 * 60 * 60 * 1000);
  });
});

describe('isVerifyTokenValid', () => {
  const now = 1_000_000;
  it('is true for a future expiry', () => {
    expect(isVerifyTokenValid(new Date(now + 1000), now)).toBe(true);
  });
  it('is false for a past expiry', () => {
    expect(isVerifyTokenValid(new Date(now - 1000), now)).toBe(false);
  });
  it('is false at the exact expiry instant', () => {
    expect(isVerifyTokenValid(new Date(now), now)).toBe(false);
  });
  it('is false for null/undefined (no outstanding verification)', () => {
    expect(isVerifyTokenValid(null, now)).toBe(false);
    expect(isVerifyTokenValid(undefined, now)).toBe(false);
  });
  it('is false for an unparseable date', () => {
    expect(isVerifyTokenValid(new Date('nonsense'), now)).toBe(false);
  });
});

describe('hashVerifyToken', () => {
  it('is deterministic and 64 hex chars (sha256)', () => {
    const h = hashVerifyToken('abc');
    expect(h).toBe(hashVerifyToken('abc'));
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });
  it('differs for different tokens', () => {
    expect(hashVerifyToken('abc')).not.toBe(hashVerifyToken('abd'));
  });
});

describe('mintVerifyToken', () => {
  it('returns a token whose hash matches hashVerifyToken and an expiry TTL ahead', () => {
    const now = 2_000_000;
    const { token, tokenHash, expires } = mintVerifyToken(now);
    expect(token.length).toBeGreaterThan(20);
    expect(tokenHash).toBe(hashVerifyToken(token));
    expect(expires.getTime()).toBe(now + VERIFY_TTL_MS);
  });
  it('produces distinct tokens across calls', () => {
    expect(mintVerifyToken().token).not.toBe(mintVerifyToken().token);
  });
});

describe('verifyHashMatches', () => {
  it('is true for identical hex strings', () => {
    const h = hashVerifyToken('abc');
    expect(verifyHashMatches(h, h)).toBe(true);
  });
  it('is false for different or absent values', () => {
    expect(verifyHashMatches(hashVerifyToken('abc'), hashVerifyToken('abd'))).toBe(false);
    expect(verifyHashMatches(null, 'x')).toBe(false);
    expect(verifyHashMatches('x', undefined)).toBe(false);
    expect(verifyHashMatches('ab', 'abc')).toBe(false); // length mismatch → no throw
  });
});
