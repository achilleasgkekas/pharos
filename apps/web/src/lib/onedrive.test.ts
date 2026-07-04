import { describe, it, expect } from 'vitest';
import { accountFromIdToken } from './onedrive';

// accountFromIdToken pulls the signed-in account label out of the OAuth id_token JWT.
// The middle (payload) segment is base64url-encoded JSON; the function must decode it
// without a crypto library (it never verifies the signature — the token was just minted
// by Microsoft over TLS) and must NEVER throw: a malformed/missing token has to yield ''
// so onedriveAccount simply stays blank rather than blowing up pollDeviceToken.

/** Build a JWT-shaped string with the given payload object as the middle segment.
 *  Encodes as base64url (replace +→-, /→_) exactly as a real id_token would arrive. */
function jwt(payload: Record<string, unknown>): string {
  const b64url = (s: string) =>
    Buffer.from(s, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(payload));
  return `${header}.${body}.signature-not-verified`;
}

describe('accountFromIdToken', () => {
  it('prefers preferred_username over email and name', () => {
    const token = jwt({ preferred_username: 'user@example.com', email: 'other@example.com', name: 'Full Name' });
    expect(accountFromIdToken(token)).toBe('user@example.com');
  });

  it('falls back to email when preferred_username is absent', () => {
    const token = jwt({ email: 'mail@example.com', name: 'Full Name' });
    expect(accountFromIdToken(token)).toBe('mail@example.com');
  });

  it('falls back to name when only name is present', () => {
    expect(accountFromIdToken(jwt({ name: 'Achilleas Gkekas' }))).toBe('Achilleas Gkekas');
  });

  it('returns "" when the payload has none of the three claims', () => {
    expect(accountFromIdToken(jwt({ sub: '123', aud: 'client', iat: 1700000000 }))).toBe('');
  });

  it('treats an empty-string claim value as absent (falls through)', () => {
    // preferred_username '' is falsy → should fall through to email, not return ''
    expect(accountFromIdToken(jwt({ preferred_username: '', email: 'mail@example.com' }))).toBe('mail@example.com');
  });

  it('decodes base64url payloads containing - and _ (url-safe chars)', () => {
    // '~~~' base64-encodes with a '+' → '-' in base64url; '???' produces '/' → '_'.
    // Exercising the reverse-replace path the function does before Buffer decode.
    const value = '~~~???-value@example.com';
    const token = jwt({ preferred_username: value });
    // sanity: the encoded payload really does carry the url-safe chars we mean to test
    expect(/[-_]/.test(token.split('.')[1])).toBe(true);
    expect(accountFromIdToken(token)).toBe(value);
  });

  it('decodes UTF-8 (Greek) claim values correctly', () => {
    expect(accountFromIdToken(jwt({ name: 'Αχιλλέας Γκέκας' }))).toBe('Αχιλλέας Γκέκας');
  });

  it('returns "" for an empty token', () => {
    expect(accountFromIdToken('')).toBe('');
  });

  it('returns "" when there is no payload segment (header only, no dots)', () => {
    expect(accountFromIdToken('onlyoneheadersegment')).toBe('');
  });

  it('returns "" when the payload segment is empty (leading dot)', () => {
    expect(accountFromIdToken('.')).toBe('');
    expect(accountFromIdToken('header..sig')).toBe('');
  });

  it('returns "" when the payload is not valid base64/JSON (never throws)', () => {
    expect(accountFromIdToken('header.not*valid*json.sig')).toBe('');
  });

  it('returns "" when the payload decodes to a JSON non-object (array/primitive)', () => {
    const arr = Buffer.from('[1,2,3]', 'utf8').toString('base64').replace(/=+$/, '');
    // JSON.parse succeeds but property access on a string/number would be undefined → ''
    const num = Buffer.from('42', 'utf8').toString('base64').replace(/=+$/, '');
    expect(accountFromIdToken(`h.${arr}.s`)).toBe('');
    expect(accountFromIdToken(`h.${num}.s`)).toBe('');
  });
});
