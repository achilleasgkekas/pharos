import { describe, it, expect } from 'vitest';
import {
  MIN_PASSWORD,
  resetRequestReady,
  newPasswordError,
  resetConfirmReady,
  describeRecoveryError,
  tokenLink,
} from './recoveryValidation';

describe('resetRequestReady', () => {
  it('accepts a syntactically valid email', () => {
    expect(resetRequestReady('a@b.co')).toBe(true);
  });
  it('rejects a malformed email', () => {
    expect(resetRequestReady('nope')).toBe(false);
    expect(resetRequestReady('')).toBe(false);
  });
});

describe('newPasswordError', () => {
  it('rejects a short password', () => {
    expect(newPasswordError('short', 'short')).toBe(
      `Password must be at least ${MIN_PASSWORD} characters`
    );
  });
  it('rejects a non-string password', () => {
    // @ts-expect-error exercising the runtime guard
    expect(newPasswordError(undefined, '')).toContain('at least');
  });
  it('rejects a mismatch even when long enough', () => {
    expect(newPasswordError('abcdefgh', 'abcdefgi')).toBe('Passwords do not match');
  });
  it('accepts a valid matching pair', () => {
    expect(newPasswordError('abcdefgh', 'abcdefgh')).toBeNull();
  });
});

describe('resetConfirmReady', () => {
  it('requires a non-blank token', () => {
    expect(resetConfirmReady('   ', 'abcdefgh', 'abcdefgh')).toBe(false);
    expect(resetConfirmReady('tok', 'abcdefgh', 'abcdefgh')).toBe(true);
  });
  it('is false when the password pair is invalid', () => {
    expect(resetConfirmReady('tok', 'short', 'short')).toBe(false);
    expect(resetConfirmReady('tok', 'abcdefgh', 'nope')).toBe(false);
  });
});

describe('describeRecoveryError', () => {
  it('prefers a non-blank server message', () => {
    expect(describeRecoveryError(400, 'Link already used')).toBe('Link already used');
  });
  it('falls back per status when server message is blank/absent', () => {
    expect(describeRecoveryError(400, '   ')).toBe('This link is invalid or has expired');
    expect(describeRecoveryError(401)).toBe('Please sign in and try again');
    expect(describeRecoveryError(404)).toBe('This feature is not available on this server');
    expect(describeRecoveryError(500)).toBe('Something went wrong. Please try again');
    expect(describeRecoveryError(418)).toBe('Request failed. Please try again');
  });
});

describe('tokenLink', () => {
  it('builds a same-origin confirm link with an encoded token', () => {
    expect(tokenLink('/account/verify', 'a b/c')).toBe('/account/verify?token=a%20b%2Fc');
  });
  it('trims the token before encoding', () => {
    expect(tokenLink('/account/reset/confirm', '  tok  ')).toBe(
      '/account/reset/confirm?token=tok'
    );
  });
});
