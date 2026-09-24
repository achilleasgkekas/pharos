import { describe, it, expect } from 'vitest';
import { scryptSync, randomBytes } from 'node:crypto';
import { hashPassword, verifyPassword, verifyPasswordFor } from './auth';

// Pure password-hashing helpers of lib/auth.ts. scrypt via node:crypto — no DB,
// no cookies, deterministic against a known hash. The async accessors
// (getCurrentUser/requireUser/...) touch next/headers + DB → out of scope here.
// These two functions are the credential gate for every login, so pin them hard.

describe('hashPassword', () => {
  it('produces the self-describing scrypt$N$r$p$salt$hash shape', () => {
    const h = hashPassword('correct horse battery staple');
    const parts = h.split('$');
    expect(parts).toHaveLength(6);
    expect(parts[0]).toBe('scrypt');
    // Default cost params baked into the module.
    expect(parts[1]).toBe('16384'); // N
    expect(parts[2]).toBe('8'); // r
    expect(parts[3]).toBe('1'); // p
    // salt (16 bytes) + hash (64 bytes) as base64.
    expect(Buffer.from(parts[4], 'base64')).toHaveLength(16);
    expect(Buffer.from(parts[5], 'base64')).toHaveLength(64);
  });

  it('uses a fresh random salt per call (same password → different strings)', () => {
    const a = hashPassword('same-password');
    const b = hashPassword('same-password');
    expect(a).not.toBe(b);
    // Salt segment differs, which is what drives the different derived hash.
    expect(a.split('$')[4]).not.toBe(b.split('$')[4]);
    // Yet both verify against the original plaintext.
    expect(verifyPassword('same-password', a)).toBe(true);
    expect(verifyPassword('same-password', b)).toBe(true);
  });
});

describe('verifyPassword', () => {
  it('round-trips a freshly hashed password', () => {
    const h = hashPassword('s3cr3t!');
    expect(verifyPassword('s3cr3t!', h)).toBe(true);
  });

  it('rejects the wrong password', () => {
    const h = hashPassword('s3cr3t!');
    expect(verifyPassword('S3cr3t!', h)).toBe(false); // case-sensitive
    expect(verifyPassword('s3cr3t', h)).toBe(false); // missing char
    expect(verifyPassword('', h)).toBe(false);
  });

  it('round-trips empty and unicode passwords', () => {
    const empty = hashPassword('');
    expect(verifyPassword('', empty)).toBe(true);
    expect(verifyPassword(' ', empty)).toBe(false);

    const uni = hashPassword('κωδικός-🔐-Ω');
    expect(verifyPassword('κωδικός-🔐-Ω', uni)).toBe(true);
    expect(verifyPassword('κωδικος-🔐-Ω', uni)).toBe(false); // different accent
  });

  it('reads the cost params from the stored string (not the module defaults)', () => {
    // Craft a hash at a non-default N so a verify that ignored the stored N would fail.
    const salt = randomBytes(16);
    const derived = scryptSync('pw', salt, 64, { N: 1024, r: 8, p: 1 });
    const stored = `scrypt$1024$8$1$${salt.toString('base64')}$${derived.toString('base64')}`;
    expect(verifyPassword('pw', stored)).toBe(true);
    expect(verifyPassword('nope', stored)).toBe(false);
  });

  it('never throws on malformed stored strings — returns false', () => {
    expect(verifyPassword('x', '')).toBe(false);
    expect(verifyPassword('x', 'plaintext')).toBe(false);
    expect(verifyPassword('x', 'scrypt$16384$8$1')).toBe(false); // too few parts
    expect(verifyPassword('x', 'scrypt$16384$8$1$salt$hash$extra')).toBe(false); // too many
    expect(verifyPassword('x', 'bcrypt$16384$8$1$c2FsdA==$aGFzaA==')).toBe(false); // wrong algo tag
  });

  it('rejects when numeric cost params are non-numeric or zero', () => {
    const salt = randomBytes(16).toString('base64');
    const hash = randomBytes(64).toString('base64');
    expect(verifyPassword('x', `scrypt$abc$8$1$${salt}$${hash}`)).toBe(false); // N NaN
    expect(verifyPassword('x', `scrypt$0$8$1$${salt}$${hash}`)).toBe(false); // N zero
    expect(verifyPassword('x', `scrypt$16384$0$1$${salt}$${hash}`)).toBe(false); // r zero
    expect(verifyPassword('x', `scrypt$16384$8$0$${salt}$${hash}`)).toBe(false); // p zero
  });

  it('rejects when the stored hash segment is empty', () => {
    const salt = randomBytes(16).toString('base64');
    expect(verifyPassword('x', `scrypt$16384$8$1$${salt}$`)).toBe(false);
  });

  it('rejects a tampered hash of the right length', () => {
    const h = hashPassword('tamper-me');
    const parts = h.split('$');
    const good = Buffer.from(parts[5], 'base64');
    good[0] = good[0] ^ 0xff; // flip first byte, keep length
    parts[5] = good.toString('base64');
    expect(verifyPassword('tamper-me', parts.join('$'))).toBe(false);
  });

  it('does not throw on non-string stored input', () => {
    // Runtime robustness: callers pass DB values that could be nullish.
    expect(verifyPassword('x', undefined as unknown as string)).toBe(false);
    expect(verifyPassword('x', null as unknown as string)).toBe(false);
    expect(verifyPassword('x', 12345 as unknown as string)).toBe(false);
  });
});

// The login paths used to read `if (!user || !verifyPassword(...))`. With no matching account
// `!user` short-circuited and scrypt never ran, so a wrong USERNAME answered measurably faster
// than a wrong password — and timing the endpoint revealed which usernames exist.
describe('verifyPasswordFor — no account must cost the same as a wrong password', () => {
  const real = hashPassword('correct horse battery staple');

  it('answers the same as verifyPassword when there is an account', () => {
    expect(verifyPasswordFor('correct horse battery staple', real)).toBe(true);
    expect(verifyPasswordFor('wrong', real)).toBe(false);
  });

  it('answers false when there is no account, whatever the password', () => {
    for (const stored of [null, undefined, '']) {
      expect(verifyPasswordFor('anything', stored)).toBe(false);
    }
  });

});
