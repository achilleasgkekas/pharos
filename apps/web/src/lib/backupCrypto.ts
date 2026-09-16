// Passphrase-encrypted backup envelope (P54). Same primitives as the secret-at-rest crypto
// (lib/tenancy/secretCrypto.ts): AES-256-GCM + scrypt via node:crypto, ZERO new dependency.
//
// The difference from secretCrypto is the KEY SOURCE: there the key derives from AUTH_SECRET
// (deterministic, server-side); here it derives from a USER passphrase + a RANDOM salt stored
// in the envelope, so a backup file is portable (decryptable on any instance with the
// passphrase) and tied to nothing on the box. The passphrase is only ever in memory.
//
// NODE-only (node:crypto). Never import from edge/middleware/client.
import { scryptSync, randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

// scrypt cost — same profile as lib/auth.ts / secretCrypto (128*N*r ≈ 16 MB, under Node's 32 MB).
const N = 16384;
const R = 8;
const P = 1;
const KEY_LEN = 32; // AES-256
const IV_LEN = 12; // GCM nonce
const TAG_LEN = 16; // GCM auth tag
const SALT_LEN = 16;
const ALGO = 'aes-256-gcm';

// Self-describing marker so a restore can detect an encrypted file without trying to import it,
// and so a future format change is possible.
export const BACKUP_ENC_APP = 'pharos-enc';
export const BACKUP_ENC_VERSION = 1;

export type BackupEnvelope = {
  app: typeof BACKUP_ENC_APP;
  v: number;
  kdf: 'scrypt';
  salt: string; // base64
  iv: string; // base64
  tag: string; // base64
  data: string; // base64 ciphertext
};

/** Is this text a Pharos encrypted-backup envelope? Cheap structural check (no passphrase). */
export function isEncryptedBackup(text: string): boolean {
  try {
    const o = JSON.parse(text) as Partial<BackupEnvelope>;
    return !!o && o.app === BACKUP_ENC_APP && typeof o.data === 'string' && typeof o.salt === 'string';
  } catch {
    return false;
  }
}

function deriveKey(passphrase: string, salt: Buffer): Buffer {
  return scryptSync(passphrase, salt, KEY_LEN, { N, r: R, p: P });
}

/** Encrypt a plaintext backup string under a passphrase → the envelope JSON string. */
export function encryptBackup(plaintext: string, passphrase: string): string {
  if (!passphrase || passphrase.length < 8) throw new Error('Passphrase must be at least 8 characters');
  const salt = randomBytes(SALT_LEN);
  const iv = randomBytes(IV_LEN);
  const key = deriveKey(passphrase, salt);
  const cipher = createCipheriv(ALGO, key, iv, { authTagLength: TAG_LEN });
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const env: BackupEnvelope = {
    app: BACKUP_ENC_APP,
    v: BACKUP_ENC_VERSION,
    kdf: 'scrypt',
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    data: enc.toString('base64'),
  };
  return JSON.stringify(env);
}

/**
 * Decrypt an envelope with the passphrase → the original plaintext. Throws a clear error on a
 * wrong passphrase or a tampered file (GCM auth failure), never returns garbage — so a bad
 * passphrase can never be mistaken for a corrupt/partial restore.
 */
export function decryptBackup(envelope: string, passphrase: string): string {
  let env: BackupEnvelope;
  try {
    env = JSON.parse(envelope) as BackupEnvelope;
  } catch {
    throw new Error('Not a valid encrypted backup file');
  }
  if (!env || env.app !== BACKUP_ENC_APP || !env.data || !env.salt || !env.iv || !env.tag) {
    throw new Error('Not a valid encrypted backup file');
  }
  const salt = Buffer.from(env.salt, 'base64');
  const iv = Buffer.from(env.iv, 'base64');
  const tag = Buffer.from(env.tag, 'base64');
  if (tag.length !== TAG_LEN) throw new Error('Not a valid encrypted backup file');
  const key = deriveKey(passphrase, salt);
  const decipher = createDecipheriv(ALGO, key, iv, { authTagLength: TAG_LEN });
  decipher.setAuthTag(tag);
  try {
    const dec = Buffer.concat([decipher.update(Buffer.from(env.data, 'base64')), decipher.final()]);
    return dec.toString('utf8');
  } catch {
    // GCM final() throws when the tag doesn't verify — the passphrase is wrong or the file
    // was altered. Either way there is no usable plaintext.
    throw new Error('Wrong passphrase, or the backup file is corrupt');
  }
}
