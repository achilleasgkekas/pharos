import { describe, it, expect } from 'vitest';
import { MIN_PASSWORD, sanitizeName, passwordChangeError } from './accountProfile';

// Only the PURE helpers are unit-tested. The GET/PATCH/POST route handlers are SaaS-gated
// (404 when SAAS_MODE off) and operate on the caller's own Account session; their profile +
// password-change policy is asserted here through sanitizeName + passwordChangeError.

describe('sanitizeName', () => {
  it('trims surrounding whitespace', () => {
    expect(sanitizeName('  Achilleas  ')).toBe('Achilleas');
  });
  it('keeps empty as empty', () => {
    expect(sanitizeName('')).toBe('');
    expect(sanitizeName('   ')).toBe('');
  });
  it('coerces non-strings to empty', () => {
    expect(sanitizeName(undefined)).toBe('');
    expect(sanitizeName(null)).toBe('');
    expect(sanitizeName(42)).toBe('');
    expect(sanitizeName({})).toBe('');
  });
  it('caps the length at 120 chars', () => {
    const long = 'a'.repeat(200);
    expect(sanitizeName(long)).toHaveLength(120);
  });
});

describe('passwordChangeError', () => {
  it('rejects a new password shorter than the minimum', () => {
    expect(passwordChangeError('oldpassword', 'short')).toBe(
      `Password must be at least ${MIN_PASSWORD} characters`
    );
    // exactly MIN_PASSWORD - 1 is still too short
    expect(passwordChangeError('oldpassword', 'a'.repeat(MIN_PASSWORD - 1))).toContain('at least');
  });
  it('rejects a new password identical to the current one', () => {
    expect(passwordChangeError('samepassword', 'samepassword')).toBe(
      'New password must be different from the current password'
    );
  });
  it('accepts a valid, different new password (length >= minimum)', () => {
    expect(passwordChangeError('oldpassword', 'newpassword123')).toBeNull();
    // exactly MIN_PASSWORD chars is acceptable
    expect(passwordChangeError('oldpassword', 'a'.repeat(MIN_PASSWORD))).toBeNull();
  });
  it('checks the length rule before the must-differ rule', () => {
    // both current and next are the same short string → length error wins
    expect(passwordChangeError('short', 'short')).toContain('at least');
  });
});
