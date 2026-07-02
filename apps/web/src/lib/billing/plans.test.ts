import { describe, it, expect, afterEach } from 'vitest';
import {
  PLANS,
  PLAN_KEYS,
  planDef,
  stripePriceId,
  planForPriceId,
  type PlanKey,
} from './plans';

// Pure module: no DB, no Stripe SDK. stripePriceId/planForPriceId read process.env at call
// time, so those blocks save + restore the two Stripe Price-ID env vars per test to stay
// deterministic and side-effect-free.

const PRICE_ENVS = ['STRIPE_PRICE_SHARED', 'STRIPE_PRICE_DEDICATED'] as const;

describe('PLANS / PLAN_KEYS table', () => {
  it('exposes exactly the three ladder keys in ascending order', () => {
    expect(PLAN_KEYS).toEqual(['free', 'shared', 'dedicated']);
  });

  it('every PLAN_KEYS entry has a matching self-consistent PLANS def', () => {
    for (const key of PLAN_KEYS) {
      const def = PLANS[key];
      expect(def).toBeDefined();
      expect(def.key).toBe(key); // the map key and def.key must agree
      expect(typeof def.name).toBe('string');
      expect(def.name.length).toBeGreaterThan(0);
      expect(['shared', 'dedicated']).toContain(def.tier);
      expect(def.priceMonthlyEUR).toBeGreaterThanOrEqual(0);
      expect(def.storageGB).toBeGreaterThan(0);
    }
  });

  it('free is the only zero-price tier and has no Stripe binding', () => {
    expect(PLANS.free.priceMonthlyEUR).toBe(0);
    expect(PLANS.free.stripePriceEnv).toBeNull();
    expect(PLANS.free.customDomain).toBe(false);
    expect(PLANS.free.aiCallsPerMonth).toBe(50);
  });

  it('paid tiers carry a Stripe env binding and non-zero price', () => {
    expect(PLANS.shared.priceMonthlyEUR).toBeGreaterThan(0);
    expect(PLANS.shared.stripePriceEnv).toBe('STRIPE_PRICE_SHARED');
    expect(PLANS.dedicated.priceMonthlyEUR).toBeGreaterThan(0);
    expect(PLANS.dedicated.stripePriceEnv).toBe('STRIPE_PRICE_DEDICATED');
  });

  it('only the dedicated tier is dedicated-isolation + custom-domain + unlimited AI', () => {
    expect(PLANS.dedicated.tier).toBe('dedicated');
    expect(PLANS.dedicated.customDomain).toBe(true);
    expect(PLANS.dedicated.aiCallsPerMonth).toBeNull(); // unlimited / BYO-key
    // The two shared-isolation tiers keep metered AI + no custom domain.
    expect(PLANS.free.tier).toBe('shared');
    expect(PLANS.shared.tier).toBe('shared');
    expect(PLANS.shared.customDomain).toBe(false);
    expect(PLANS.shared.aiCallsPerMonth).toBe(1000);
  });

  it('storage quota grows monotonically up the ladder', () => {
    expect(PLANS.free.storageGB).toBeLessThan(PLANS.shared.storageGB);
    expect(PLANS.shared.storageGB).toBeLessThan(PLANS.dedicated.storageGB);
  });
});

describe('planDef', () => {
  it('returns the matching def for each known key', () => {
    expect(planDef('free')).toBe(PLANS.free);
    expect(planDef('shared')).toBe(PLANS.shared);
    expect(planDef('dedicated')).toBe(PLANS.dedicated);
  });

  it('falls back to free for unknown / legacy / empty / nullish keys', () => {
    expect(planDef('enterprise')).toBe(PLANS.free);
    expect(planDef('')).toBe(PLANS.free);
    expect(planDef(null)).toBe(PLANS.free);
    expect(planDef(undefined)).toBe(PLANS.free);
    expect(planDef('FREE')).toBe(PLANS.free); // keys are case-sensitive → unknown → free
  });
});

describe('stripePriceId', () => {
  afterEach(() => {
    for (const e of PRICE_ENVS) delete process.env[e];
  });

  it('always returns null for the free plan regardless of env', () => {
    process.env.STRIPE_PRICE_SHARED = 'price_x';
    expect(stripePriceId('free')).toBeNull();
  });

  it('reads the configured Stripe Price ID from the plan-bound env var', () => {
    process.env.STRIPE_PRICE_SHARED = 'price_shared_123';
    process.env.STRIPE_PRICE_DEDICATED = 'price_ded_456';
    expect(stripePriceId('shared')).toBe('price_shared_123');
    expect(stripePriceId('dedicated')).toBe('price_ded_456');
  });

  it('returns null when the env var is unset (Stripe not configured yet)', () => {
    expect(stripePriceId('shared')).toBeNull();
    expect(stripePriceId('dedicated')).toBeNull();
  });

  it('trims surrounding whitespace and treats blank-only as unset', () => {
    process.env.STRIPE_PRICE_SHARED = '  price_trim_789  ';
    expect(stripePriceId('shared')).toBe('price_trim_789');
    process.env.STRIPE_PRICE_DEDICATED = '   ';
    expect(stripePriceId('dedicated')).toBeNull();
  });
});

describe('planForPriceId', () => {
  afterEach(() => {
    for (const e of PRICE_ENVS) delete process.env[e];
  });

  it('reverse-maps a configured price id back to its plan key', () => {
    process.env.STRIPE_PRICE_SHARED = 'price_shared_123';
    process.env.STRIPE_PRICE_DEDICATED = 'price_ded_456';
    expect(planForPriceId('price_shared_123')).toBe<PlanKey>('shared');
    expect(planForPriceId('price_ded_456')).toBe<PlanKey>('dedicated');
  });

  it('returns null for an empty price id', () => {
    process.env.STRIPE_PRICE_SHARED = 'price_shared_123';
    expect(planForPriceId('')).toBeNull();
  });

  it('returns null for an unknown price id', () => {
    process.env.STRIPE_PRICE_SHARED = 'price_shared_123';
    expect(planForPriceId('price_nope')).toBeNull();
  });

  it('returns null when no plan prices are configured (avoids matching unset==unset)', () => {
    // Both env vars unset → stripePriceId() is null for every plan. A blank query must not
    // spuriously match those nulls; the empty-id guard + non-empty query both protect this.
    expect(planForPriceId('price_shared_123')).toBeNull();
    expect(planForPriceId('')).toBeNull();
  });
});
