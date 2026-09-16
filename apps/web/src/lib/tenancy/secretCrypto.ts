// Secret-at-rest crypto (TODO §14 / D5 RESOLVED) — encrypt a tenant's own AI provider key
// (BYO-key) at rest in Mongo, decrypt only on-demand in memory at the AI call site.
//
// Design (Achilleas D5): AES-256-GCM (authenticated → tamper-evident), the 32-byte key
// DERIVED from the existing `AUTH_SECRET` via scrypt (node:crypto → ZERO new dependency).
// Deterministic derivation (fixed app salt) so the same AUTH_SECRET always yields the same
// key → we can decrypt later. A random 12-byte IV per encryption keeps ciphertexts unique.
//
// NODE-only (node:crypto). NEVER import from middleware/edge. Fail-closed: without a real
// AUTH_SECRET we refuse to encrypt/decrypt (mirrors session.ts `authConfigured`). This module
// only handles bytes — WHERE the ciphertext lives (Tenant doc) is the caller's concern.
//
// OSS PARITY: the self-hosted app's own AI provider key still lives in AppConfig unencrypted
// (single-owner box, unchanged) — this module reaches it only via lib/userMfaStore.ts (P79),
// which reuses this same envelope for the self-hosted User's TOTP secret, same as the SaaS
// BYO-key path.
import { scryptSync, randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

// Fixed application salt for the KDF. NOT a secret (it is in source): its only job is domain
// separation so the derived encryption key differs from any other AUTH_SECRET-derived key
// (e.g. the JWT signer). Changing it would make existing ciphertexts undecryptable.
const KDF_SALT = 'pharos:byo-key:aes256gcm:v1';

// scrypt cost — same profile as lib/auth.ts (128*N*r ≈ 16 MB, under Node's 32 MB maxmem).
const N = 16384;
const R = 8;
const P = 1;

const KEY_LEN = 32; // AES-256
const IV_LEN = 12; // GCM standard nonce
const TAG_LEN = 16; // GCM auth tag
const ALGO = 'aes-256-gcm';
const FORMAT = 'gcm1'; // self-describing prefix → future format migration is possible

// Deriving the key runs scrypt (~ms + 16 MB), so cache it keyed by the secret value. Keyed by
// AUTH_SECRET so a rotated secret (or a test that swaps env) re-derives instead of using stale.
let cachedSecret: string | null = null;
let cachedKey: Buffer | null = null;

/** True when AUTH_SECRET is configured (min 16 chars). Lets callers fail closed clearly. */
export function secretCryptoReady(): boolean {
  const s = process.env.AUTH_SECRET;
  return typeof s === 'string' && s.length >= 16;
}

function deriveKey(): Buffer {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error('AUTH_SECRET is not set (min 16 chars) — cannot encrypt/decrypt secrets');
  }
  if (cachedKey && cachedSecret === secret) return cachedKey;
  const key = scryptSync(secret, KDF_SALT, KEY_LEN, { N, r: R, p: P });
  cachedSecret = secret;
  cachedKey = key;
  return key;
}

/**
 * Encrypt a plaintext secret into a self-describing `gcm1$<iv>$<tag>$<ciphertext>` string
 * (all parts base64). A fresh random IV per call → encrypting the same value twice yields
 * different ciphertexts. Throws if AUTH_SECRET is missing or the input is not a string.
 */
export function encryptSecret(plaintext: string): string {
  if (typeof plaintext !== 'string') throw new Error('encryptSecret: plaintext must be a string');
  const key = deriveKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv, { authTagLength: TAG_LEN });
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${FORMAT}$${iv.toString('base64')}$${tag.toString('base64')}$${ct.toString('base64')}`;
}

/**
 * Decrypt a string produced by `encryptSecret`. Returns the plaintext, or `null` on ANY
 * failure: malformed format, wrong AUTH_SECRET, or tampered ciphertext/tag (GCM auth fails).
 * Never throws — callers treat null as "no usable key".
 */
export function decryptSecret(stored: string): string | null {
  try {
    if (typeof stored !== 'string') return null;
    const parts = stored.split('$');
    if (parts.length !== 4 || parts[0] !== FORMAT) return null;
    const iv = Buffer.from(parts[1], 'base64');
    const tag = Buffer.from(parts[2], 'base64');
    const ct = Buffer.from(parts[3], 'base64');
    if (iv.length !== IV_LEN || tag.length !== TAG_LEN) return null;
    const key = deriveKey();
    const decipher = createDecipheriv(ALGO, key, iv, { authTagLength: TAG_LEN });
    decipher.setAuthTag(tag);
    const out = Buffer.concat([decipher.update(ct), decipher.final()]);
    return out.toString('utf8');
  } catch {
    return null;
  }
}

/** True when `stored` has the expected encrypted-secret envelope shape (no decryption). */
export function isEncryptedSecret(stored: unknown): boolean {
  return typeof stored === 'string' && stored.startsWith(`${FORMAT}$`) && stored.split('$').length === 4;
}
