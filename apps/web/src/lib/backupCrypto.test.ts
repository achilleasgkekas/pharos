import { describe, it, expect } from 'vitest';
import { encryptBackup, decryptBackup, isEncryptedBackup, BACKUP_ENC_APP } from './backupCrypto';

const PLAIN = JSON.stringify({ app: 'homepage', version: 1, collections: { items: [{ _id: 'a', title: 'NAS' }] } });
const PASS = 'correct horse battery';

describe('encrypt → decrypt round-trip', () => {
  it('recovers the exact plaintext with the right passphrase', () => {
    const env = encryptBackup(PLAIN, PASS);
    expect(decryptBackup(env, PASS)).toBe(PLAIN);
  });

  it('produces a self-describing envelope, not plaintext', () => {
    const env = encryptBackup(PLAIN, PASS);
    const o = JSON.parse(env);
    expect(o.app).toBe(BACKUP_ENC_APP);
    expect(o).toHaveProperty('salt');
    expect(o).toHaveProperty('iv');
    expect(o).toHaveProperty('tag');
    expect(env).not.toContain('NAS'); // the payload is not readable
  });

  it('uses a fresh salt+iv each time (same input → different ciphertext)', () => {
    expect(encryptBackup(PLAIN, PASS)).not.toBe(encryptBackup(PLAIN, PASS));
  });
});

describe('decrypt failures are clear, never silent', () => {
  it('throws on the wrong passphrase', () => {
    const env = encryptBackup(PLAIN, PASS);
    expect(() => decryptBackup(env, 'wrong passphrase')).toThrow(/wrong passphrase|corrupt/i);
  });

  it('throws on a tampered ciphertext', () => {
    const o = JSON.parse(encryptBackup(PLAIN, PASS));
    const buf = Buffer.from(o.data, 'base64');
    buf[0] ^= 0xff; // flip a byte
    o.data = buf.toString('base64');
    expect(() => decryptBackup(JSON.stringify(o), PASS)).toThrow(/wrong passphrase|corrupt/i);
  });

  it('throws on a non-envelope file', () => {
    expect(() => decryptBackup('{"app":"homepage"}', PASS)).toThrow(/not a valid encrypted backup/i);
    expect(() => decryptBackup('not json', PASS)).toThrow(/not a valid encrypted backup/i);
  });

  it('rejects a too-short passphrase at encrypt time', () => {
    expect(() => encryptBackup(PLAIN, 'short')).toThrow(/at least 8/i);
  });
});

describe('isEncryptedBackup', () => {
  it('detects an envelope, rejects a plain backup', () => {
    expect(isEncryptedBackup(encryptBackup(PLAIN, PASS))).toBe(true);
    expect(isEncryptedBackup(PLAIN)).toBe(false);
    expect(isEncryptedBackup('garbage')).toBe(false);
  });
});
