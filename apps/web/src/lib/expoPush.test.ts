import { describe, it, expect } from 'vitest';
import { isExpoPushToken } from './expoPush';

// `isExpoPushToken` is the pure validation gate the push-registration API uses to decide
// which strings are stored on a user and later fanned out to Expo. It must accept exactly
// the two Expo token shapes (ExponentPushToken[...] / ExpoPushToken[...]) and reject
// everything else — a false positive would persist junk that Expo rejects, a false
// negative would silently drop a real device. These tests pin that contract.
// The module also imports db/User (mongoose registration only, no connection at import),
// so loading it here is side-effect-free; we never touch the DB.
describe('isExpoPushToken', () => {
  it('accepts the ExponentPushToken shape', () => {
    expect(isExpoPushToken('ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]')).toBe(true);
  });

  it('accepts the shorter ExpoPushToken shape', () => {
    expect(isExpoPushToken('ExpoPushToken[abc123]')).toBe(true);
  });

  it('allows any non-] characters inside the brackets', () => {
    expect(isExpoPushToken('ExpoPushToken[a-b_c.9:/+=]')).toBe(true);
  });

  it('trims surrounding whitespace before matching', () => {
    expect(isExpoPushToken('  ExpoPushToken[abc]  ')).toBe(true);
    expect(isExpoPushToken('\tExponentPushToken[xyz]\n')).toBe(true);
  });

  it('rejects empty brackets (needs at least one inner char)', () => {
    expect(isExpoPushToken('ExpoPushToken[]')).toBe(false);
    expect(isExpoPushToken('ExponentPushToken[]')).toBe(false);
  });

  it('rejects a missing or malformed bracket section', () => {
    expect(isExpoPushToken('ExpoPushToken')).toBe(false);
    expect(isExpoPushToken('ExpoPushToken[abc')).toBe(false);
    expect(isExpoPushToken('ExpoPushTokenabc]')).toBe(false);
  });

  it('rejects trailing or leading content around the token', () => {
    expect(isExpoPushToken('ExpoPushToken[abc]extra')).toBe(false);
    expect(isExpoPushToken('xExpoPushToken[abc]')).toBe(false);
    expect(isExpoPushToken('prefix ExpoPushToken[abc]')).toBe(false);
  });

  it('is case-sensitive on the prefix', () => {
    expect(isExpoPushToken('expopushtoken[abc]')).toBe(false);
    expect(isExpoPushToken('EXPOPUSHTOKEN[abc]')).toBe(false);
  });

  it('rejects a nested-but-wrong prefix (Exponent without Push)', () => {
    expect(isExpoPushToken('ExponentToken[abc]')).toBe(false);
    expect(isExpoPushToken('PushToken[abc]')).toBe(false);
  });

  it('rejects the empty string and whitespace-only input', () => {
    expect(isExpoPushToken('')).toBe(false);
    expect(isExpoPushToken('   ')).toBe(false);
  });

  it('rejects non-string values', () => {
    expect(isExpoPushToken(null)).toBe(false);
    expect(isExpoPushToken(undefined)).toBe(false);
    expect(isExpoPushToken(123)).toBe(false);
    expect(isExpoPushToken(true)).toBe(false);
    expect(isExpoPushToken(['ExpoPushToken[abc]'])).toBe(false);
    expect(isExpoPushToken({ to: 'ExpoPushToken[abc]' })).toBe(false);
  });

  it('narrows the type to string on the true branch', () => {
    const v: unknown = 'ExpoPushToken[abc]';
    if (isExpoPushToken(v)) {
      // type-level assertion: v is string here (compile-time), plus runtime sanity
      expect(v.startsWith('ExpoPushToken')).toBe(true);
    } else {
      throw new Error('expected a valid token');
    }
  });
});
