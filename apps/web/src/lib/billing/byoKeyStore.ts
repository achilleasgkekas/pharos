// BYO-key STORAGE + resolver over the Tenant doc (TODO §11 BYO-key / §14 encryption at rest,
// D5). This is the layer the byoKey codec was scaffolded for: it persists the encrypted
// `{ provider, keyEnc }` envelope on `Tenant.aiKey` and keeps the `Tenant.aiByoKey` flag in
// lockstep (true when a key is stored, false when cleared) so lib/billing/aiKeyPolicy meters
// correctly. Decryption happens on-demand at the AI dispatch site via resolveTenantAiKey.
//
// The DB-touching functions are thin over two PURE planners (planAiKeyUpdate / planAiKeyClear)
// that carry the flag-consistency + validation logic — those are unit-tested; the impure
// wrappers are SaaS-gated node paths (mirrors the audit-recorder testing convention).
//
// OSS PARITY: only the SaaS BYO-key path uses this. The self-hosted app keeps its single-owner
// key in AppConfig and never creates Tenant docs, so none of this runs when SAAS_MODE is off.
import { Tenant } from '@/models/Tenant';
import {
  encodeAiKey,
  decodeAiKey,
  maskAiKey,
  byoKeyReady,
  type StoredAiKey,
  type ResolvedAiKey,
} from './byoKey';

/** Mongo `$set` that stores an encrypted key AND turns the BYO flag on (kept in lockstep). */
export type AiKeyUpdate = { $set: { aiKey: StoredAiKey; aiByoKey: true } };
/** Mongo `$set` that removes any stored key AND turns the BYO flag off. */
export type AiKeyClear = { $set: { aiKey: null; aiByoKey: false } };

/** Masked, secret-free view of a stored key for settings UIs. */
export type AiKeyMask = { provider: StoredAiKey['provider']; masked: string };

/** Why a set operation could not proceed. `invalid` = bad provider/empty key. */
export type SetKeyFail = 'crypto_unavailable' | 'invalid' | 'not_found';
export type SetKeyResult = { ok: true; masked: AiKeyMask } | { ok: false; reason: SetKeyFail };

/**
 * PURE: build the update that stores `rawKey` (encrypted) and flips `aiByoKey` on. Returns
 * null when the provider is unsupported, the key is empty, or crypto is unavailable
 * (AUTH_SECRET unset) — encodeAiKey enforces all three. The plaintext never leaves here.
 */
export function planAiKeyUpdate(provider: unknown, rawKey: unknown): AiKeyUpdate | null {
  const stored = encodeAiKey(provider, rawKey);
  if (!stored) return null;
  return { $set: { aiKey: stored, aiByoKey: true } };
}

/** PURE: the update that clears any stored key and returns the tenant to the platform key. */
export function planAiKeyClear(): AiKeyClear {
  return { $set: { aiKey: null, aiByoKey: false } };
}

/**
 * Persist a tenant's own AI key (encrypted at rest) and mark them BYO-key. Idempotent overwrite.
 * Returns a masked view on success, or a typed reason: `crypto_unavailable` (AUTH_SECRET unset),
 * `invalid` (bad provider / empty key), `not_found` (no such tenant).
 */
export async function setTenantAiKey(
  tenantId: string,
  provider: unknown,
  rawKey: unknown
): Promise<SetKeyResult> {
  if (!byoKeyReady()) return { ok: false, reason: 'crypto_unavailable' };
  const update = planAiKeyUpdate(provider, rawKey);
  if (!update) return { ok: false, reason: 'invalid' };

  const res = await Tenant.updateOne({ _id: tenantId }, update);
  if (res.matchedCount === 0) return { ok: false, reason: 'not_found' };

  // Mask from the just-built envelope (round-trips through decrypt); never the plaintext.
  const masked = maskAiKey(update.$set.aiKey);
  if (!masked) return { ok: false, reason: 'crypto_unavailable' };
  return { ok: true, masked };
}

/** Remove a tenant's stored key and revert them to the platform key. Returns whether a tenant matched. */
export async function clearTenantAiKey(tenantId: string): Promise<boolean> {
  const res = await Tenant.updateOne({ _id: tenantId }, planAiKeyClear());
  return res.matchedCount > 0;
}

/** Masked view of a tenant's stored key (provider + last-4), or null when none / undecryptable. */
export async function describeTenantAiKey(tenantId: string): Promise<AiKeyMask | null> {
  const t = (await Tenant.findById(tenantId).select('aiKey').lean()) as { aiKey?: unknown } | null;
  if (!t || !t.aiKey) return null;
  return maskAiKey(t.aiKey);
}

/**
 * Resolve a tenant's stored key to plaintext for an AI call. Returns `{ provider, key }` or
 * null (no key / tampered / crypto unavailable). Call on-demand at dispatch; never persist or
 * log the returned plaintext.
 */
export async function resolveTenantAiKey(tenantId: string): Promise<ResolvedAiKey | null> {
  const t = (await Tenant.findById(tenantId).select('aiKey').lean()) as { aiKey?: unknown } | null;
  if (!t || !t.aiKey) return null;
  return decodeAiKey(t.aiKey);
}
