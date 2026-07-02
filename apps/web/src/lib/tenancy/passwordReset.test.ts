import { describe, it, expect } from 'vitest';
import {
  RESET_TTL_MS,
  resetTokenExpiry,
  isResetTokenValid,
  resetPasswordError,
  hashResetToken,
  mintResetToken,
  resetHashMatches,
} from './passwordReset';

// The pure + crypto helpers are unit-tested. The request/confirm route handlers are
// SaaS-gated (404 when SAAS_MODE off) and unauthenticated-by-design; their token lifecycle
// (mint → store hash → look up → expire) is asserted here through these helpers.

describe('resetTokenExpiry', () => {
  it('is RESET_TTL_MS ahead of the given now', () => {
    const now = 1_000_000;
    expect(resetTokenExpiry(now).getTime()).toBe(now + RESET_TTL_MS);
  });
});

describe('isResetTokenValid', () => {
  const now = 1_000_000;
  it('is true for a future expiry', () => {
    expect(isResetTokenValid(new Date(now + 1000), now)).toBe(true);
  });
  it('is false for a past expiry', () => {
    expect(isResetTokenValid(new Date(now - 1000), now)).toBe(false);
  });
  it('is false at the exact expiry instant', () => {
    expect(isResetTokenValid(new Date(now), now)).toBe(false);
  });
  it('is false for null/undefined (no outstanding reset)', () => {
    expect(isResetTokenValid(null, now)).toBe(false);
    expect(isResetTokenValid(undefined, now)).toBe(false);
  });
  it('is false for an unparseable date', () => {
    expect(isResetTokenValid(new Date('nonsense'), now)).toBe(false);
  });
});

describe('resetPasswordError', () => {
  it('rejects a password shorter than the minimum', () => {
    expect(resetPasswordError('short')).toMatch(/at least/);
  });
  it('rejects a non-string', () => {
    expect(resetPasswordError(undefined as unknown as string)).toMatch(/at least/);
  });
  it('accepts a long-enough password', () => {
    expect(resetPasswordError('longenough1')).toBeNull();
  });
});

describe('hashResetToken', () => {
  it('is deterministic and 64 hex chars (sha256)', () => {
    const h = hashResetToken('abc');
    expect(h).toBe(hashResetToken('abc'));
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });
  it('differs for different tokens', () => {
    expect(hashResetToken('abc')).not.toBe(hashResetToken('abd'));
  });
});

describe('mintResetToken', () => {
  it('returns a token whose hash matches hashResetToken and an expiry TTL ahead', () => {
    const now = 2_000_000;
    const { token, tokenHash, expires } = mintResetToken(now);
    expect(token.length).toBeGreaterThan(20);
    expect(tokenHash).toBe(hashResetToken(token));
    expect(expires.getTime()).toBe(now + RESET_TTL_MS);
  });
  it('produces distinct tokens across calls', () => {
    expect(mintResetToken().token).not.toBe(mintResetToken().token);
  });
});

describe('resetHashMatches', () => {
  it('is true for identical hex strings', () => {
    const h = hashResetToken('abc');
    expect(resetHashMatches(h, h)).toBe(true);
  });
  it('is false for different or absent values', () => {
    expect(resetHashMatches(hashResetToken('abc'), hashResetToken('abd'))).toBe(false);
    expect(resetHashMatches(null, 'x')).toBe(false);
    expect(resetHashMatches('x', undefined)).toBe(false);
    expect(resetHashMatches('ab', 'abc')).toBe(false); // length mismatch → no throw
  });
});
