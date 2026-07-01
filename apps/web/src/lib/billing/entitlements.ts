// Plan → entitlements resolver: what a tenant on a given plan may do. This encodes the
// OSS-vs-paid split for the managed SaaS.
//
// OSS PARITY (important): the self-hosted app is AGPL and unrestricted — it must never be
// gated by this file. It runs as the implicit DEFAULT_TENANT (plan 'dedicated', see
// lib/tenancy/context.ts) so `entitlementsFor('dedicated')` returns the fullest set. All
// core FEATURES (items, receipts, statements, expenses, tasks, network, backups, …) are
// available on EVERY plan — we differentiate only on QUOTAS (storage + AI volume),
// custom domain, and isolation tier. We do NOT lock feature pages behind paywalls; the
// value ladder is capacity + AI + dedicated infra, matching the OSS-first ethos.
//
// Pure-ish: imports the plan table + the client-safe AI-feature registry (types/keys
// only). No DB, no Stripe, unit-testable.
import { AI_FEATURE_KEYS, type AiFeatureKey } from '@/lib/aiFeatures';
import { planDef, type PlanKey } from './plans';

export type Entitlements = {
  plan: PlanKey;
  storageGB: number;
  storageBytes: number; // storageGB expressed in bytes (quota checks)
  aiCallsPerMonth: number | null; // null = unlimited
  customDomain: boolean;
  tier: 'shared' | 'dedicated';
  // AI features the plan may use. Every plan gets the full set — AI access is metered by
  // VOLUME (aiCallsPerMonth), not by locking individual features. Kept as an explicit
  // list so a future cheaper tier could restrict specific features without new plumbing.
  aiFeatures: AiFeatureKey[];
};

const GB = 1024 * 1024 * 1024;

/** Resolve a plan key (or unknown/legacy value → free) to its entitlements. */
export function entitlementsFor(plan: string | null | undefined): Entitlements {
  const def = planDef(plan);
  return {
    plan: def.key,
    storageGB: def.storageGB,
    storageBytes: def.storageGB * GB,
    aiCallsPerMonth: def.aiCallsPerMonth,
    customDomain: def.customDomain,
    tier: def.tier,
    // No per-feature lock today: all plans get every AI feature; the cap is call volume.
    aiFeatures: [...AI_FEATURE_KEYS],
  };
}

/** Whether a plan may use a given AI feature (all plans → true today; kept for a future
 *  tier that trims the feature list). Volume limits are enforced separately (#11). */
export function canUseAiFeature(plan: string | null | undefined, key: AiFeatureKey): boolean {
  return entitlementsFor(plan).aiFeatures.includes(key);
}

/** Storage quota check: true when `usedBytes` is still within the plan's allowance.
 *  Consumed by the future dbStats metering / upgrade-prompt (#10). */
export function withinStorage(plan: string | null | undefined, usedBytes: number): boolean {
  return usedBytes <= entitlementsFor(plan).storageBytes;
}

/** AI volume check: true when `usedCalls` is still within the plan's monthly allowance.
 *  Unlimited plans (aiCallsPerMonth === null) always return true. */
export function withinAiQuota(plan: string | null | undefined, usedCalls: number): boolean {
  const cap = entitlementsFor(plan).aiCallsPerMonth;
  return cap === null || usedCalls < cap;
}
