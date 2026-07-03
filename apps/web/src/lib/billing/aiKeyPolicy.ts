// AI key policy (TODO §11 BYO-key) — decides whether a tenant's AI calls run on the
// PLATFORM's shared key (metered against the plan's AI volume) or on the tenant's OWN key
// (BYO-key: unmetered, zero platform cost → effectively unlimited AI).
//
// PURE module: a single type-only import (erased at runtime), no DB / no Stripe / no secret
// handling. It reads only the boolean BYO flag carried on the TenantContext (`ctx.byoKey`,
// sourced from Tenant.aiByoKey). The encrypted key itself lives/rotates elsewhere (TODO §14
// encryption at rest — Needs Achilleas); this file never touches the secret.
//
// OSS PARITY (critical): the self-hosted DEFAULT_TENANT is never metered regardless
// (usage.ts `isMetered` short-circuits on isDefault / SAAS_MODE off), so this policy only
// shapes managed multi-tenant behaviour. A BYO-key tenant and an unmetered self-hosted app
// both end up UNLIMITED, just via different gates.
import type { QuotaStatus } from './usage';

/** Which key a tenant's AI calls run on. */
export type AiKeyMode = 'platform' | 'byo';

/** Coerce the (optional) BYO flag to a strict boolean. undefined/null/non-true → false. */
export function isByoKey(flag: boolean | null | undefined): boolean {
  return flag === true;
}

/** Resolve the BYO flag to the key mode a tenant's AI calls use. */
export function aiKeyMode(flag: boolean | null | undefined): AiKeyMode {
  return isByoKey(flag) ? 'byo' : 'platform';
}

/**
 * Whether AI usage should be metered against the plan's volume. BYO-key tenants bring their
 * own provider key → zero cost to the platform → NOT metered (and never blocked on AI
 * volume). Platform-key tenants (the default) are metered normally.
 */
export function meterAiUsage(flag: boolean | null | undefined): boolean {
  return !isByoKey(flag);
}

/**
 * The canonical "unlimited, always-allowed" AI quota status an unmetered context gets
 * (BYO-key tenant, the self-hosted default, or SAAS_MODE off). Matches the exact shape
 * usage.ts already returns for its non-metered branches, so callers can treat all three
 * unmetered cases identically. `used` is surfaced (clamped ≥0) for "X calls so far" UIs
 * even though there is no cap.
 */
export function unmeteredAiQuota(used: number = 0): QuotaStatus {
  return { used: Math.max(0, used), limit: null, remaining: null, allowed: true, ratio: 0 };
}
