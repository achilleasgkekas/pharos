// Per-tenant usage metering — records AI calls + storage footprint against a tenant's
// plan quotas, and answers "may this tenant do one more?" for enforcement.
//
// BACKWARD-COMPATIBILITY / OSS PARITY (critical): metering is a SaaS-only concern. When
// SAAS_MODE is off, or for the implicit self-hosted DEFAULT_TENANT, every function here is
// a NO-OP that reports UNLIMITED. The self-hosted app never writes a Usage doc and is never
// blocked. Nothing here is wired into AI call sites yet — this is the ledger + the helpers
// the wiring increment (and #10 dbStats / #11 cutoffs) will consume.
//
// The DB-touching functions live below a set of PURE helpers (periodOf / quotaStatus) that
// carry the logic and are unit-tested without a database.
import { connectDB } from '@/lib/db';
import { Usage, type UsageDoc } from '@/models/Usage';
import { entitlementsFor, withinAiQuota, withinStorage } from './entitlements';
import { isByoKey, meterAiUsage, unmeteredAiQuota } from './aiKeyPolicy';
import { normalizeAiUsage, type AiUsageDetail } from './aiCost';
import { saasMode } from '@/lib/tenancy/saasMode';
import type { TenantContext } from '@/lib/tenancy/context';

// ---------------------------------------------------------------------------------------
// PURE helpers (no DB, unit-tested)
// ---------------------------------------------------------------------------------------

/** Billing period key "YYYY-MM" (UTC) for a given date (default: now). */
export function periodOf(date: Date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export type QuotaStatus = {
  /** Quantity consumed this period. */
  used: number;
  /** Plan allowance (null = unlimited). */
  limit: number | null;
  /** limit - used, floored at 0; null when unlimited. */
  remaining: number | null;
  /** Whether ONE more unit is allowed (used < limit, or unlimited). */
  allowed: boolean;
  /** 0..1 fraction of the allowance used (0 when unlimited). For "X of Y used" UIs. */
  ratio: number;
};

/** Build an AI-quota status for a plan given how many calls are already used this period. */
export function aiQuotaStatus(plan: string | null | undefined, used: number): QuotaStatus {
  const limit = entitlementsFor(plan).aiCallsPerMonth;
  return quotaFor(used, limit, withinAiQuota(plan, used));
}

/** Build a storage-quota status for a plan given the bytes currently used. */
export function storageQuotaStatus(plan: string | null | undefined, usedBytes: number): QuotaStatus {
  const limit = entitlementsFor(plan).storageBytes;
  return quotaFor(usedBytes, limit, withinStorage(plan, usedBytes));
}

function quotaFor(used: number, limit: number | null, allowed: boolean): QuotaStatus {
  const u = Math.max(0, used);
  if (limit === null) {
    return { used: u, limit: null, remaining: null, allowed: true, ratio: 0 };
  }
  return {
    used: u,
    limit,
    remaining: Math.max(0, limit - u),
    allowed,
    ratio: limit > 0 ? Math.min(1, u / limit) : 1,
  };
}

// ---------------------------------------------------------------------------------------
// DB-touching functions (SaaS-only; no-op + unlimited for the default tenant)
// ---------------------------------------------------------------------------------------

/** True when this context should be metered at all (SaaS on + a real, non-default tenant). */
function isMetered(ctx: TenantContext): boolean {
  return saasMode() && !ctx.isDefault && !!ctx.tenantId;
}

export type UsageSnapshot = {
  period: string;
  aiCalls: number;
  aiInputTokens: number;
  aiOutputTokens: number;
  aiCostMicros: number;
  storageBytes: number;
  metered: boolean;
};

/** A zeroed snapshot (default tenant / SAAS_MODE off) — no DB access. */
function zeroSnapshot(period: string): UsageSnapshot {
  return { period, aiCalls: 0, aiInputTokens: 0, aiOutputTokens: 0, aiCostMicros: 0, storageBytes: 0, metered: false };
}

/**
 * Current-period usage for a tenant. The default/self-hosted tenant (or SAAS_MODE off)
 * returns a zeroed, `metered:false` snapshot without any DB access.
 */
export async function currentUsage(ctx: TenantContext, at: Date = new Date()): Promise<UsageSnapshot> {
  const period = periodOf(at);
  if (!isMetered(ctx)) return zeroSnapshot(period);
  await connectDB();
  const doc = (await Usage.findOne({ tenant: ctx.tenantId, period }).lean()) as UsageDoc | null;
  return {
    period,
    aiCalls: doc?.aiCalls ?? 0,
    aiInputTokens: doc?.aiInputTokens ?? 0,
    aiOutputTokens: doc?.aiOutputTokens ?? 0,
    aiCostMicros: doc?.aiCostMicros ?? 0,
    storageBytes: doc?.storageBytes ?? 0,
    metered: true,
  };
}

/**
 * Record one AI operation's full usage (calls + input/output tokens + estimated cost micros)
 * against the tenant's current period. Returns the new running aiCalls total (0 = not
 * recorded). No-op for the default tenant / SAAS_MODE off / BYO-key tenants. Atomic `$inc`
 * upsert so concurrent calls don't lose increments. `detail.calls` defaults to 1.
 */
export async function recordAiUsage(
  ctx: TenantContext,
  detail: AiUsageDetail = {},
  at: Date = new Date()
): Promise<number> {
  // BYO-key tenants run on their own AI key → zero platform cost → not metered.
  if (!isMetered(ctx) || !meterAiUsage(ctx.byoKey)) return 0;
  const { calls, inputTokens, outputTokens, costMicros } = normalizeAiUsage(detail);
  // Nothing to record → skip the write entirely (keeps "n === 0" callers a true no-op).
  if (calls === 0 && inputTokens === 0 && outputTokens === 0 && costMicros === 0) return 0;
  const period = periodOf(at);
  await connectDB();
  const doc = await Usage.findOneAndUpdate(
    { tenant: ctx.tenantId, period },
    { $inc: { aiCalls: calls, aiInputTokens: inputTokens, aiOutputTokens: outputTokens, aiCostMicros: costMicros } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();
  return (doc as UsageDoc | null)?.aiCalls ?? 0;
}

/**
 * Record `n` AI calls (default 1) against the tenant's current period, returning the new
 * running total. Thin wrapper over `recordAiUsage` (no token/cost detail) — preserved for
 * callers that only count call volume. No-op returning 0 for the default tenant / SAAS_MODE
 * off / BYO-key tenants.
 */
export async function recordAiCall(ctx: TenantContext, n: number = 1, at: Date = new Date()): Promise<number> {
  return recordAiUsage(ctx, { calls: n }, at);
}

/**
 * Overwrite the tenant's storage-footprint snapshot for the current period (a gauge, not a
 * sum). Consumed by #10 dbStats sampling. No-op for the default tenant / SAAS_MODE off.
 */
export async function setStorageBytes(ctx: TenantContext, bytes: number, at: Date = new Date()): Promise<void> {
  if (!isMetered(ctx)) return;
  const period = periodOf(at);
  await connectDB();
  await Usage.findOneAndUpdate(
    { tenant: ctx.tenantId, period },
    { $set: { storageBytes: Math.max(0, bytes), storageMeasuredAt: at } },
    { upsert: true, setDefaultsOnInsert: true }
  );
}

/**
 * AI-quota gate for the CURRENT period: may this tenant make one more AI call? The default
 * tenant / SAAS_MODE off is always allowed (unlimited). Reads the ledger, applies the plan
 * cap. The enforcement wiring (block + "upgrade") calls this before an AI op later.
 */
export async function checkAiQuota(ctx: TenantContext, at: Date = new Date()): Promise<QuotaStatus> {
  if (!isMetered(ctx)) return unmeteredAiQuota();
  // BYO-key tenants bring their own key → unlimited AI, never blocked (no ledger read).
  if (isByoKey(ctx.byoKey)) return unmeteredAiQuota();
  const { aiCalls } = await currentUsage(ctx, at);
  return aiQuotaStatus(ctx.plan, aiCalls);
}

/**
 * Storage-quota gate: is the tenant within its plan's storage allowance (optionally after
 * adding `additionalBytes`)? Default tenant / SAAS_MODE off → always allowed.
 */
export async function checkStorageQuota(
  ctx: TenantContext,
  additionalBytes: number = 0,
  at: Date = new Date()
): Promise<QuotaStatus> {
  if (!isMetered(ctx)) return { used: 0, limit: null, remaining: null, allowed: true, ratio: 0 };
  const { storageBytes } = await currentUsage(ctx, at);
  return storageQuotaStatus(ctx.plan, storageBytes + Math.max(0, additionalBytes));
}
