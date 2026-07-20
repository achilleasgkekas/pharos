import { describe, it, expect } from 'vitest';
import { mfaCodeReady, mfaPasswordReady, describeMfaError } from './mfaSettings';

describe('mfaCodeReady', () => {
  it('accepts exactly 6 digits', () => {
    expect(mfaCodeReady('123456')).toBe(true);
  });

  it('trims surrounding whitespace before checking', () => {
    expect(mfaCodeReady('  123456  ')).toBe(true);
  });

  it('rejects the wrong length', () => {
    expect(mfaCodeReady('12345')).toBe(false);
    expect(mfaCodeReady('1234567')).toBe(false);
    expect(mfaCodeReady('')).toBe(false);
  });

  it('rejects non-digit characters', () => {
    expect(mfaCodeReady('12a456')).toBe(false);
    expect(mfaCodeReady('123 456')).toBe(false);
  });
});

describe('mfaPasswordReady', () => {
  it('rejects blank/whitespace-only input', () => {
    expect(mfaPasswordReady('')).toBe(false);
    expect(mfaPasswordReady('   ')).toBe(false);
  });

  it('accepts any non-blank input (the server checks correctness)', () => {
    expect(mfaPasswordReady('x')).toBe(true);
    expect(mfaPasswordReady('  hunter2  ')).toBe(true);
  });
});

describe('describeMfaError', () => {
  it('maps known reason codes to friendlier text', () => {
    expect(describeMfaError(400, 'invalid_code')).toMatch(/did not match/);
    expect(describeMfaError(400, 'no_pending')).toMatch(/expired/);
    expect(describeMfaError(503, 'crypto_unavailable')).toMatch(/not available/);
    expect(describeMfaError(404, 'not_found')).toBe('Account not found.');
    expect(describeMfaError(401, 'Invalid credentials')).toBe('Incorrect password.');
    expect(describeMfaError(400, 'password is required')).toMatch(/Enter your password/);
  });

  it('passes through an unmapped server error string verbatim', () => {
    expect(describeMfaError(400, 'some other reason')).toBe('some other reason');
  });

  it('ignores a blank/whitespace server error and falls back by status', () => {
    expect(describeMfaError(401, '  ')).toBe('Please sign in again');
    expect(describeMfaError(500, undefined)).toBe('Something went wrong. Please try again');
  });

  it('has a generic fallback for an unmapped status with no server error', () => {
    expect(describeMfaError(418)).toBe('Could not save. Please try again');
  });
});
