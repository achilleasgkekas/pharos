// BYO-key storage codec + resolver (TODO §11 BYO-key, §14 encryption at rest / D5) — the thin
// layer between a tenant's raw AI provider key and its encrypted-at-rest form. It pairs the
// provider label with the ciphertext produced by lib/tenancy/secretCrypto, so a later increment
// can persist `{ provider, keyEnc }` on the Tenant doc and read it back at the AI call site.
//
// This file is a PURE codec over data shapes (no DB, no Stripe) — it only encrypts/decrypts and
// validates. Wiring the record onto Tenant read/write is a separate, deliberate increment.
//
// OSS PARITY: only the SaaS BYO-key path uses this; the self-hosted app keeps its unencrypted
// single-owner key in AppConfig. The flag that selects platform-vs-BYO lives in aiKeyPolicy.ts.
import { encryptSecret, decryptSecret, secretCryptoReady, isEncryptedSecret } from '../tenancy/secretCrypto';

/** Providers a tenant can bring their own key for (mirrors the app's AI provider set). */
export const BYO_PROVIDERS = ['anthropic', 'openai', 'gemini', 'openrouter', 'custom'] as const;
export type ByoProvider = (typeof BYO_PROVIDERS)[number];

/** Persisted shape: which provider, and the encrypted key. `keyEnc` is a secretCrypto envelope. */
export type StoredAiKey = { provider: ByoProvider; keyEnc: string };

/** Resolved shape handed to the AI call site: provider + decrypted plaintext key. */
export type ResolvedAiKey = { provider: ByoProvider; key: string };

/** Whether BYO-key storage can operate (needs AUTH_SECRET for the derived encryption key). */
export function byoKeyReady(): boolean {
  return secretCryptoReady();
}

/** Type guard for a supported provider label. */
export function isByoProvider(v: unknown): v is ByoProvider {
  return typeof v === 'string' && (BYO_PROVIDERS as readonly string[]).includes(v);
}

/**
 * Encode a raw provider key for storage: validates provider + non-empty key, then encrypts.
 * Returns the `{ provider, keyEnc }` record to persist, or `null` on invalid input / when
 * crypto is unavailable (AUTH_SECRET unset). The plaintext never leaves this call.
 */
export function encodeAiKey(provider: unknown, rawKey: unknown): StoredAiKey | null {
  if (!isByoProvider(provider)) return null;
  if (typeof rawKey !== 'string') return null;
  const key = rawKey.trim();
  if (key.length === 0) return null;
  if (!secretCryptoReady()) return null;
  try {
    return { provider, keyEnc: encryptSecret(key) };
  } catch {
    return null;
  }
}

/**
 * Decode a stored record back to a usable key. Returns `{ provider, key }`, or `null` on a
 * malformed record, unsupported provider, tampered/undecryptable ciphertext, or missing crypto.
 * Call this on-demand at the AI dispatch site — never persist or log the returned plaintext.
 */
export function decodeAiKey(stored: unknown): ResolvedAiKey | null {
  if (!stored || typeof stored !== 'object') return null;
  const rec = stored as Partial<StoredAiKey>;
  if (!isByoProvider(rec.provider)) return null;
  if (!isEncryptedSecret(rec.keyEnc)) return null;
  const key = decryptSecret(rec.keyEnc as string);
  if (key === null || key.length === 0) return null;
  return { provider: rec.provider, key };
}

/** Non-secret preview of a stored key for settings UIs: provider + masked tail, never plaintext. */
export function maskAiKey(stored: unknown): { provider: ByoProvider; masked: string } | null {
  const decoded = decodeAiKey(stored);
  if (!decoded) return null;
  const k = decoded.key;
  const tail = k.length >= 4 ? k.slice(-4) : k;
  return { provider: decoded.provider, masked: `••••${tail}` };
}
