// The PLATFORM AI key: one provider key the operator sets once, which every workspace
// without its own key runs on (and gets billed for — see aiBilling.ts).
//
// Storage is the same encrypted path as the per-tenant BYO keys (encodeAiKey/decodeAiKey over
// lib/tenancy/secretCrypto), so there is one implementation of "hold a provider secret" and
// one place it can be got wrong. It lives in the control-plane PlatformConfig singleton, not
// on a tenant, because it belongs to nobody's workspace and must not travel with a tenant
// export or erasure.
//
// NOTHING here returns plaintext to a caller that did not ask for dispatch: the settings side
// gets a mask, and `resolvePlatformAiKey` is the only export that yields a usable key.
import { connectDB } from '@/lib/db';
import { PlatformConfig } from '@/models/PlatformConfig';
import { encodeAiKey, maskAiKey, decodeAiKey, type ResolvedAiKey } from './byoKey';
import type { AiKeyMask } from './byoKeyStore';

export type SetPlatformKeyResult =
  | { ok: true; masked: AiKeyMask }
  | { ok: false; reason: 'invalid' | 'crypto-unavailable' };

/**
 * Store (or replace) the platform key.
 *
 * `encodeAiKey` returning null covers both an unusable input and a server with no AUTH_SECRET
 * to encrypt with; those are told apart for the caller so the UI can say "not configured to
 * store secrets" instead of blaming the key the operator just typed.
 */
export async function setPlatformAiKey(
  provider: unknown,
  rawKey: unknown,
  actor: string
): Promise<SetPlatformKeyResult> {
  const encoded = encodeAiKey(provider, rawKey);
  if (!encoded) {
    const { secretCryptoReady } = await import('@/lib/tenancy/secretCrypto');
    return { ok: false, reason: secretCryptoReady() ? 'invalid' : 'crypto-unavailable' };
  }
  await connectDB();
  await PlatformConfig.updateOne(
    { key: 'singleton' },
    { $set: { aiKey: encoded, aiKeyUpdatedAt: new Date(), aiKeyUpdatedBy: actor } },
    { upsert: true }
  );
  const masked = maskAiKey(encoded);
  // maskAiKey re-decodes what was just encoded; if that fails the record is unusable, so say
  // so rather than reporting a save that dispatch will not be able to read back.
  if (!masked) return { ok: false, reason: 'crypto-unavailable' };
  return { ok: true, masked };
}

/** Remove the platform key. Idempotent: clearing an absent key is a success, not an error. */
export async function clearPlatformAiKey(actor: string): Promise<boolean> {
  await connectDB();
  await PlatformConfig.updateOne(
    { key: 'singleton' },
    { $set: { aiKey: null, aiKeyUpdatedAt: new Date(), aiKeyUpdatedBy: actor } },
    { upsert: true }
  );
  return true;
}

export type PlatformKeyInfo = {
  masked: AiKeyMask | null;
  updatedAt: string;
  updatedBy: string;
};

/** Non-secret description for the operator console: provider + masked tail, never plaintext. */
export async function describePlatformAiKey(): Promise<PlatformKeyInfo> {
  await connectDB();
  const doc = (await PlatformConfig.findOne({ key: 'singleton' })
    .select('aiKey aiKeyUpdatedAt aiKeyUpdatedBy')
    .lean()) as { aiKey?: unknown; aiKeyUpdatedAt?: Date | null; aiKeyUpdatedBy?: string } | null;
  return {
    masked: doc?.aiKey ? maskAiKey(doc.aiKey) : null,
    updatedAt: doc?.aiKeyUpdatedAt ? new Date(doc.aiKeyUpdatedAt).toISOString() : '',
    updatedBy: doc?.aiKeyUpdatedBy || '',
  };
}

/**
 * The usable platform key, or null. Called at AI dispatch only.
 *
 * Never throws: the control plane being unreachable must degrade to "no platform key" (the
 * caller then falls back to env, or to no AI at all) rather than break every parse in the
 * fleet.
 */
export async function resolvePlatformAiKey(): Promise<ResolvedAiKey | null> {
  try {
    await connectDB();
    const doc = (await PlatformConfig.findOne({ key: 'singleton' }).select('aiKey').lean()) as {
      aiKey?: unknown;
    } | null;
    if (!doc?.aiKey) return null;
    return decodeAiKey(doc.aiKey);
  } catch {
    return null;
  }
}
