// AI-metering integration for the central AI dispatch (TODO §11 wiring).
//
// This is the ONE place that ties the request-scoped current tenant (lib/tenancy/current)
// to the metering ledger (usage.ts) + the plan cap (enforce.ts). The AI dispatch functions
// (`runVisionJSON` / `runTextJSON` in lib/ollama.ts) call `assertAiQuota()` BEFORE hitting a
// provider and `meterAiResult()` AFTER a successful call. Everything else about AI dispatch
// is untouched.
//
// OSS PARITY (critical): for the self-hosted DEFAULT_TENANT (and SAAS_MODE off) the tenant
// is never metered — `enforceAiQuota` resolves to unlimited/allowed with no DB access, and
// `recordAiUsage` is a no-op. So `assertAiQuota` never throws and `meterAiResult` never
// writes: the self-hosted app is byte-for-byte unchanged and pays zero DB cost per AI call.
import { currentTenant } from '@/lib/tenancy/current';
import { enforceAiQuota } from './enforce';
import { recordAiUsage } from './usage';
import { estimateCostMicros, type AiUsageDetail } from './aiCost';

/**
 * Thrown when the current tenant is over its AI-call allowance for the period. Carries the
 * quota figures so an API route can turn it into the 402 `quota_exceeded` body (see
 * lib/billing/enforce.ts `quotaExceededResponse`). Distinguishable from a transport/model
 * error via `instanceof AiQuotaExceededError`.
 */
export class AiQuotaExceededError extends Error {
  readonly code = 'quota_exceeded' as const;
  readonly plan: string | null;
  readonly used: number;
  readonly limit: number | null;
  readonly remaining: number | null;

  constructor(plan: string | null, used: number, limit: number | null, remaining: number | null) {
    super('AI usage limit reached for this plan');
    this.name = 'AiQuotaExceededError';
    this.plan = plan;
    this.used = used;
    this.limit = limit;
    this.remaining = remaining;
  }
}

/**
 * Gate an AI operation on the current tenant's quota. Call BEFORE the provider request.
 * Throws `AiQuotaExceededError` when the tenant is out of AI calls for the period. No-op
 * (always passes) for the self-hosted default tenant, SAAS_MODE off, and BYO-key tenants —
 * those resolve to an unlimited/allowed status inside `enforceAiQuota` with no DB access.
 */
export async function assertAiQuota(): Promise<void> {
  const ctx = currentTenant();
  const gate = await enforceAiQuota(ctx);
  if (!gate.allowed) {
    throw new AiQuotaExceededError(ctx.plan, gate.status.used, gate.status.limit, gate.status.remaining);
  }
}

/** Token usage a provider reports back (both fields optional; absent → 0). */
export type ProviderTokenUsage = { inputTokens?: number; outputTokens?: number };

/**
 * Record one completed AI call against the current tenant's ledger. Call AFTER a successful
 * provider response. Derives an estimated cost from token counts (placeholder rate until
 * real pricing is set). No-op for the default tenant / SAAS_MODE off / BYO-key tenants.
 * Never throws — a metering write must not fail the user's AI operation, so any error is
 * swallowed (the ledger is best-effort; enforcement already happened up front).
 */
export async function meterAiResult(usage: ProviderTokenUsage = {}): Promise<void> {
  const ctx = currentTenant();
  const detail: AiUsageDetail = {
    calls: 1,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    costMicros: estimateCostMicros(usage.inputTokens ?? 0, usage.outputTokens ?? 0),
  };
  try {
    await recordAiUsage(ctx, detail);
  } catch {
    // Best-effort: never let a ledger write break the AI response the user already got.
  }
}
