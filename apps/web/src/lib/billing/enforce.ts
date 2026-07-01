// AI/storage-quota ENFORCEMENT gate — the thin, drop-in primitive that turns a metered
// tenant's quota status into an allow/deny decision plus the 402 HTTP response for an
// over-quota tenant. This is the piece an AI route wires in with two lines:
//
//   const gate = await enforceAiQuota(ctx);
//   if (!gate.allowed) return quotaExceededResponse('ai', gate.status, ctx.plan);
//   ... do the AI op ...
//   await recordAiCall(ctx);
//
// OSS PARITY (critical): for the implicit self-hosted DEFAULT_TENANT (or SAAS_MODE off),
// the underlying checkAiQuota/checkStorageQuota already report UNLIMITED + allowed without
// any DB access, so enforceAiQuota/enforceStorageQuota are pure pass-throughs → the
// self-hosted app is never blocked and never hits the ledger. Nothing here is wired into a
// feature route yet; it's the reusable gate the wiring increment drops in.
//
// The HTTP body builder (`quotaExceededBody`) is PURE and unit-tested; the async gates are
// exercised via their default-tenant pass-through (also DB-free).
import { NextResponse } from 'next/server';
import type { TenantContext } from '@/lib/tenancy/context';
import { checkAiQuota, checkStorageQuota, type QuotaStatus } from './usage';

/** What a quota gate returns: the allow flag plus the full status for messaging/UI. */
export type EnforceResult = {
  allowed: boolean;
  status: QuotaStatus;
};

/** Kind of quota that was exceeded — drives the human message + client handling. */
export type QuotaKind = 'ai' | 'storage';

/**
 * May this tenant make ONE more AI call this period? Reads the ledger + applies the plan
 * cap (default tenant / SAAS_MODE off → always allowed, unlimited, no DB). Call BEFORE the
 * AI op; on `!allowed` return `quotaExceededResponse('ai', ...)`.
 */
export async function enforceAiQuota(ctx: TenantContext, at?: Date): Promise<EnforceResult> {
  const status = await checkAiQuota(ctx, at);
  return { allowed: status.allowed, status };
}

/**
 * Is the tenant within its storage allowance (optionally after adding `additionalBytes`)?
 * Call BEFORE accepting an upload. Default tenant / SAAS_MODE off → always allowed.
 */
export async function enforceStorageQuota(
  ctx: TenantContext,
  additionalBytes: number = 0,
  at?: Date
): Promise<EnforceResult> {
  const status = await checkStorageQuota(ctx, additionalBytes, at);
  return { allowed: status.allowed, status };
}

const KIND_LABEL: Record<QuotaKind, string> = {
  ai: 'AI usage',
  storage: 'storage',
};

/**
 * PURE JSON body for a 402 over-quota response. Stable, machine-readable shape so the
 * client can show an upgrade prompt: `{ error, code: 'quota_exceeded', kind, plan, used,
 * limit, remaining, upgrade: true }`.
 */
export function quotaExceededBody(kind: QuotaKind, status: QuotaStatus, plan?: string | null) {
  return {
    error: `${KIND_LABEL[kind]} limit reached for this plan`,
    code: 'quota_exceeded' as const,
    kind,
    plan: plan ?? null,
    used: status.used,
    limit: status.limit,
    remaining: status.remaining,
    upgrade: true as const,
  };
}

/**
 * The 402 Payment Required response for an over-quota tenant. Wraps `quotaExceededBody` so
 * a route can `return quotaExceededResponse('ai', gate.status, ctx.plan)`.
 */
export function quotaExceededResponse(kind: QuotaKind, status: QuotaStatus, plan?: string | null): NextResponse {
  return NextResponse.json(quotaExceededBody(kind, status, plan), { status: 402 });
}
