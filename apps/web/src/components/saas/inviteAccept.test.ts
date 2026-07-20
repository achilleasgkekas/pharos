import { describe, it, expect } from 'vitest';
import { inviteAcceptReady, inviteAcceptHref, MIN_PASSWORD } from './inviteAccept';

describe('inviteAcceptReady', () => {
  it('allows an empty password (invitee already has an account)', () => {
    expect(inviteAcceptReady('')).toBe(true);
  });

  it(`rejects a password shorter than ${MIN_PASSWORD} chars`, () => {
    expect(inviteAcceptReady('short')).toBe(false);
  });

  it(`accepts a password at least ${MIN_PASSWORD} chars`, () => {
    expect(inviteAcceptReady('a'.repeat(MIN_PASSWORD))).toBe(true);
  });

  it('treats a missing password the same as empty', () => {
    // @ts-expect-error exercising the runtime guard against a non-string caller
    expect(inviteAcceptReady(undefined)).toBe(true);
  });
});

describe('inviteAcceptHref', () => {
  it('builds a relative signup link carrying the token', () => {
    expect(inviteAcceptHref('abc123')).toBe('/signup?invite=abc123');
  });

  it('URL-encodes special characters in the token', () => {
    expect(inviteAcceptHref('a b/c+d')).toBe('/signup?invite=a%20b%2Fc%2Bd');
  });

  it('trims surrounding whitespace before encoding', () => {
    expect(inviteAcceptHref('  abc123  ')).toBe('/signup?invite=abc123');
  });

  it('handles an empty token', () => {
    expect(inviteAcceptHref('')).toBe('/signup?invite=');
  });
});
