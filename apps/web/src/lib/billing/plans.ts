// SaaS plan ladder — the single source of truth for pricing tiers, quotas and their
// Stripe Price-ID env bindings. PURE module (no imports) so it is safe from any runtime
// and unit-testable without a DB or the Stripe SDK.
//
// Only meaningful when SAAS_MODE is on. The self-hosted (AGPL) app never reads plans —
// it behaves as an implicit `dedicated` tenant with everything unlocked (see
// entitlements.ts → OSS parity note). No real charge happens here; this only maps a plan
// key to its metadata + the ENV NAME that holds its Stripe Price ID (keys deferred by
// Achilleas, provided later via env, never hardcoded).

export type PlanKey = 'free' | 'shared' | 'dedicated';

export const PLAN_KEYS: readonly PlanKey[] = ['free', 'shared', 'dedicated'] as const;

export type PlanDef = {
  key: PlanKey;
  name: string;
  // Isolation tier this plan provisions (mirrors Tenant.tier).
  tier: 'shared' | 'dedicated';
  // Display price in EUR / month (0 = free). Not the charge amount — Stripe holds that.
  priceMonthlyEUR: number;
  // Storage quota in GB (data files + db). Enforced by #10 dbStats metering later.
  storageGB: number;
  // Included AI calls per billing month. null = unlimited (BYO-key tenants) — see #11.
  aiCallsPerMonth: number | null;
  // Custom domain allowed (dedicated/top tier only).
  customDomain: boolean;
  // Name of the env var holding this plan's Stripe Price ID. null for free (no charge).
  stripePriceEnv: string | null;
};

export const PLANS: Record<PlanKey, PlanDef> = {
  free: {
    key: 'free',
    name: 'Free',
    tier: 'shared',
    priceMonthlyEUR: 0,
    storageGB: 5,
    aiCallsPerMonth: 50,
    customDomain: false,
    stripePriceEnv: null,
  },
  shared: {
    key: 'shared',
    name: 'Pro',
    tier: 'shared',
    priceMonthlyEUR: 9,
    storageGB: 50,
    aiCallsPerMonth: 1000,
    customDomain: false,
    stripePriceEnv: 'STRIPE_PRICE_SHARED',
  },
  dedicated: {
    key: 'dedicated',
    name: 'Dedicated',
    tier: 'dedicated',
    priceMonthlyEUR: 29,
    storageGB: 500,
    aiCallsPerMonth: null, // unlimited / BYO-key
    customDomain: true,
    stripePriceEnv: 'STRIPE_PRICE_DEDICATED',
  },
};

/** Plan definition for a key, falling back to `free` for unknown/legacy values. */
export function planDef(key: string | null | undefined): PlanDef {
  return PLANS[(key as PlanKey)] ?? PLANS.free;
}

/** The Stripe Price ID for a paid plan, read from env at call time (never hardcoded).
 *  Returns null for `free` or when the env var is unset (Stripe not configured yet). */
export function stripePriceId(key: PlanKey): string | null {
  const envName = PLANS[key]?.stripePriceEnv;
  if (!envName) return null;
  const v = (process.env[envName] || '').trim();
  return v || null;
}

/** Reverse lookup: which plan a given Stripe Price ID belongs to (for webhook handling).
 *  null when no configured plan matches. */
export function planForPriceId(priceId: string): PlanKey | null {
  if (!priceId) return null;
  for (const key of PLAN_KEYS) {
    if (stripePriceId(key) === priceId) return key;
  }
  return null;
}
