import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  encryptSecret,
  decryptSecret,
  secretCryptoReady,
  isEncryptedSecret,
} from './secretCrypto';

// AUTH_SECRET is read at call time (not module load) → toggle per test with save/restore.
const SECRET = 'test-secret-at-least-16-chars-long';
let saved: string | undefined;

beforeEach(() => {
  saved = process.env.AUTH_SECRET;
  process.env.AUTH_SECRET = SECRET;
});
afterEach(() => {
  if (saved === undefined) delete process.env.AUTH_SECRET;
  else process.env.AUTH_SECRET = saved;
});

describe('secretCryptoReady', () => {
  it('true when AUTH_SECRET is at least 16 chars', () => {
    process.env.AUTH_SECRET = 'x'.repeat(16);
    expect(secretCryptoReady()).toBe(true);
  });
  it('false when AUTH_SECRET is short or unset', () => {
    process.env.AUTH_SECRET = 'short';
    expect(secretCryptoReady()).toBe(false);
    delete process.env.AUTH_SECRET;
    expect(secretCryptoReady()).toBe(false);
  });
});

describe('encrypt/decrypt round-trip', () => {
  it('decrypts back to the original plaintext', () => {
    const plain = 'sk-ant-api03-super-secret-key-value';
    const enc = encryptSecret(plain);
    expect(decryptSecret(enc)).toBe(plain);
  });

  it('handles unicode and empty strings', () => {
    for (const plain of ['', 'κλειδί-με-ελληνικά', '🔑 emoji key']) {
      expect(decryptSecret(encryptSecret(plain))).toBe(plain);
    }
  });

  it('produces the self-describing gcm1$iv$tag$ct envelope', () => {
    const enc = encryptSecret('abc');
    const parts = enc.split('$');
    expect(parts[0]).toBe('gcm1');
    expect(parts).toHaveLength(4);
    expect(isEncryptedSecret(enc)).toBe(true);
  });

  it('uses a fresh IV → same plaintext encrypts to different ciphertexts', () => {
    const a = encryptSecret('same');
    const b = encryptSecret('same');
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe('same');
    expect(decryptSecret(b)).toBe('same');
  });
});

describe('decrypt failure modes (never throws → null)', () => {
  it('returns null on malformed / wrong-format input', () => {
    expect(decryptSecret('not-encrypted')).toBeNull();
    expect(decryptSecret('gcm1$only$three')).toBeNull();
    expect(decryptSecret('plain$a$b$c')).toBeNull();
    expect(decryptSecret(undefined as unknown as string)).toBeNull();
  });

  it('returns null when the ciphertext/tag is tampered (GCM auth fails)', () => {
    const enc = encryptSecret('tamper-me');
    const parts = enc.split('$');
    // Flip the last char of the ciphertext.
    const ct = parts[3];
    const flipped = ct.slice(0, -1) + (ct.endsWith('A') ? 'B' : 'A');
    const tampered = [parts[0], parts[1], parts[2], flipped].join('$');
    expect(decryptSecret(tampered)).toBeNull();
  });

  it('returns null when decrypted with a different AUTH_SECRET', () => {
    const enc = encryptSecret('rotate-me');
    process.env.AUTH_SECRET = 'a-completely-different-secret-16+';
    expect(decryptSecret(enc)).toBeNull();
  });

  it('throws on encrypt without a usable AUTH_SECRET', () => {
    delete process.env.AUTH_SECRET;
    expect(() => encryptSecret('x')).toThrow();
  });
});

describe('isEncryptedSecret', () => {
  it('recognizes only the envelope shape', () => {
    expect(isEncryptedSecret(encryptSecret('x'))).toBe(true);
    expect(isEncryptedSecret('gcm1$a$b$c')).toBe(true);
    expect(isEncryptedSecret('gcm1$a$b')).toBe(false);
    expect(isEncryptedSecret('plaintext')).toBe(false);
    expect(isEncryptedSecret(null)).toBe(false);
    expect(isEncryptedSecret(42)).toBe(false);
  });
});
