import { describe, it, expect } from 'vitest';
import {
  isValidEmail,
  loginReady,
  signupReady,
  describeAuthError,
  safeNextPath,
  MIN_PASSWORD,
} from './authValidation';

describe('isValidEmail', () => {
  it('accepts a normal address (trimmed)', () => {
    expect(isValidEmail('a@b.co')).toBe(true);
    expect(isValidEmail('  user@example.com  ')).toBe(true);
  });
  it('rejects missing @ / dot / spaces / empty', () => {
    expect(isValidEmail('nope')).toBe(false);
    expect(isValidEmail('a@b')).toBe(false);
    expect(isValidEmail('a b@c.com')).toBe(false);
    expect(isValidEmail('')).toBe(false);
  });
});

describe('loginReady / signupReady', () => {
  it('login needs a valid email + any non-empty password', () => {
    expect(loginReady('a@b.co', 'x')).toBe(true);
    expect(loginReady('a@b.co', '')).toBe(false);
    expect(loginReady('bad', 'x')).toBe(false);
  });
  it('signup enforces the shared min-length', () => {
    expect(signupReady('a@b.co', 'x'.repeat(MIN_PASSWORD))).toBe(true);
    expect(signupReady('a@b.co', 'x'.repeat(MIN_PASSWORD - 1))).toBe(false);
    expect(signupReady('bad', 'x'.repeat(MIN_PASSWORD))).toBe(false);
  });
});

describe('describeAuthError', () => {
  it('prefers a non-empty server-provided message', () => {
    expect(describeAuthError(409, 'An account with this email already exists')).toBe(
      'An account with this email already exists'
    );
    expect(describeAuthError(401, '  Custom  ')).toBe('Custom');
  });
  it('falls back per status when server error is blank/absent', () => {
    expect(describeAuthError(401)).toBe('Invalid email or password');
    expect(describeAuthError(409, '')).toBe('An account with this email already exists');
    expect(describeAuthError(400, '   ')).toBe('Please check the details and try again');
    expect(describeAuthError(404)).toBe('Sign-in is not available on this server');
    expect(describeAuthError(503)).toBe('Something went wrong. Please try again');
    expect(describeAuthError(0)).toBe('Sign-in failed. Please try again');
  });
  it('ignores non-string server errors', () => {
    expect(describeAuthError(401, { msg: 'x' } as unknown)).toBe('Invalid email or password');
  });
});

describe('safeNextPath', () => {
  it('keeps a clean same-origin path', () => {
    expect(safeNextPath('/dashboard')).toBe('/dashboard');
    expect(safeNextPath('/a/b?x=1#h')).toBe('/a/b?x=1#h');
    expect(safeNextPath('  /trimmed  ')).toBe('/trimmed');
  });
  it('rejects open-redirect and non-path inputs → fallback', () => {
    expect(safeNextPath('//evil.com')).toBe('/');
    expect(safeNextPath('/\\evil.com')).toBe('/');
    expect(safeNextPath('https://evil.com')).toBe('/');
    expect(safeNextPath('javascript:alert(1)')).toBe('/');
    expect(safeNextPath('relative')).toBe('/');
    expect(safeNextPath('/a\\b')).toBe('/');
    expect(safeNextPath('')).toBe('/');
    expect(safeNextPath(undefined)).toBe('/');
    expect(safeNextPath(42 as unknown)).toBe('/');
  });
  it('honours a custom fallback', () => {
    expect(safeNextPath('bad', '/home')).toBe('/home');
  });
});
