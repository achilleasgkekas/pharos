// Storage-metering integration for the shared file-write path (lib/storage.ts). Mirrors
// lib/billing/aiMeter.ts exactly — same shape, same OSS-parity guarantee, same "assert before,
// meter after" call convention — just gating bytes-on-disk instead of AI calls.
//
// This is the ONE place that ties the request-scoped current tenant (lib/tenancy/current) to
// the storage ledger (usage.ts) + the plan cap (enforce.ts). `saveFile()`/`deleteFile()` in
// lib/storage.ts call `assertStorageQuota()` BEFORE writing and `recordStorageDelta()` AFTER a
// successful write/delete. Nothing else about the storage layer changes.
//
// OSS PARITY (critical): for the self-hosted DEFAULT_TENANT (and SAAS_MODE off) the tenant is
// never metered — `enforceStorageQuota` resolves to unlimited/allowed with no DB access, and
// `incrementStorageBytes` is a no-op. So `assertStorageQuota` never throws and
// `recordStorageDelta` never writes: the self-hosted app is byte-for-byte unchanged and pays
// zero DB cost per file write.
import { currentTenant } from '@/lib/tenancy/current';
import { enforceStorageQuota } from './enforce';
import { incrementStorageBytes } from './usage';

/**
 * Thrown when the current tenant is over its storage allowance for the plan. Carries the quota
 * figures so a caller can build a 402 `quota_exceeded` response (see
 * lib/billing/enforce.ts `quotaExceededResponse`), or — the common case here — just let its
 * `.message` surface through whatever generic `catch (err) { return {ok:false, error:
 * err.message} }` the upload action already has. Distinguishable via
 * `instanceof StorageQuotaExceededError`.
 */
export class StorageQuotaExceededError extends Error {
  readonly code = 'quota_exceeded' as const;
  readonly plan: string | null;
  readonly used: number;
  readonly limit: number | null;
  readonly remaining: number | null;

  constructor(plan: string | null, used: number, limit: number | null, remaining: number | null) {
    super('Storage limit reached for this plan — delete some files or upgrade.');
    this.name = 'StorageQuotaExceededError';
    this.plan = plan;
    this.used = used;
    this.limit = limit;
    this.remaining = remaining;
  }
}

/**
 * Gate a file write on the current tenant's storage quota. Call BEFORE creating the directory /
 * writing the buffer, with the buffer's byte length. Throws `StorageQuotaExceededError` when
 * writing `additionalBytes` more would put the tenant over their plan's allowance. No-op
 * (always passes) for the self-hosted default tenant and SAAS_MODE off — those resolve to an
 * unlimited/allowed status inside `enforceStorageQuota` with no DB access.
 */
export async function assertStorageQuota(additionalBytes: number): Promise<void> {
  const ctx = currentTenant();
  const gate = await enforceStorageQuota(ctx, additionalBytes);
  if (!gate.allowed) {
    throw new StorageQuotaExceededError(ctx.plan, gate.status.used, gate.status.limit, gate.status.remaining);
  }
}

/**
 * Adjust the current tenant's storage ledger by `deltaBytes` (positive after a save, negative
 * after a delete). Call AFTER the filesystem operation succeeded. No-op for the default tenant /
 * SAAS_MODE off. Never throws — a metering write must not fail the file operation the user
 * already got, so any error is swallowed (the ledger is best-effort; enforcement already
 * happened up front, and the periodic dbStats sampler reconciles any drift).
 */
export async function recordStorageDelta(deltaBytes: number): Promise<void> {
  const ctx = currentTenant();
  try {
    await incrementStorageBytes(ctx, deltaBytes);
  } catch {
    // Best-effort: never let a ledger write break the save/delete the user already got.
  }
}
