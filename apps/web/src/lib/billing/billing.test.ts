import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { planDef, stripePriceId, planForPriceId } from './plans';
import { entitlementsFor, canUseAiFeature, withinStorage, withinAiQuota } from './entitlements';
import { verifyStripeSignature } from './stripe';
import { AI_FEATURE_KEYS } from '@/lib/aiFeatures';

describe('plans', () => {
  it('resolves known plans and falls back to free for unknown', () => {
    expect(planDef('shared').key).toBe('shared');
    expect(planDef('dedicated').tier).toBe('dedicated');
    expect(planDef('bogus').key).toBe('free');
    expect(planDef(null).key).toBe('free');
  });

  it('reads Stripe price id from env, null when unset or free', () => {
    delete process.env.STRIPE_PRICE_SHARED;
    expect(stripePriceId('free')).toBeNull();
    expect(stripePriceId('shared')).toBeNull();
    process.env.STRIPE_PRICE_SHARED = 'price_123';
    expect(stripePriceId('shared')).toBe('price_123');
    expect(planForPriceId('price_123')).toBe('shared');
    expect(planForPriceId('price_nope')).toBeNull();
    delete process.env.STRIPE_PRICE_SHARED;
  });
});

describe('entitlements', () => {
  it('gives every plan the full AI feature set (OSS parity, volume-metered)', () => {
    for (const plan of ['free', 'shared', 'dedicated']) {
      expect(entitlementsFor(plan).aiFeatures).toEqual([...AI_FEATURE_KEYS]);
    }
    expect(canUseAiFeature('free', 'receipts')).toBe(true);
  });

  it('differentiates on quotas; no plan carries a custom domain any more', () => {
    // 2026-08-07: custom domains were dropped from the top plan. Pinned at false for EVERY
    // plan so re-adding one is a deliberate act that trips this test first.
    expect(entitlementsFor('free').customDomain).toBe(false);
    expect(entitlementsFor('shared').customDomain).toBe(false);
    expect(entitlementsFor('dedicated').customDomain).toBe(false);
    expect(entitlementsFor('dedicated').aiCallsPerMonth).toBe(1000);
    expect(entitlementsFor('free').storageBytes).toBe(0.2 * 1024 ** 3);
  });

  it('enforces storage and AI quotas', () => {
    expect(withinStorage('free', 0.1 * 1024 ** 3)).toBe(true);
    expect(withinStorage('free', 0.3 * 1024 ** 3)).toBe(false);
    expect(withinAiQuota('free', 49)).toBe(true);
    expect(withinAiQuota('free', 50)).toBe(false);
    expect(withinAiQuota('dedicated', 999)).toBe(true);
    expect(withinAiQuota('dedicated', 1000)).toBe(false); // capped since 2026-08-07
  });
});

describe('verifyStripeSignature', () => {
  const secret = 'whsec_test';
  const body = '{"id":"evt_1","type":"checkout.session.completed"}';

  function sign(ts: number, payload: string, key = secret) {
    return createHmac('sha256', key).update(`${ts}.${payload}`).digest('hex');
  }

  it('accepts a valid, in-window signature', () => {
    const ts = Math.floor(Date.now() / 1000);
    const header = `t=${ts},v1=${sign(ts, body)}`;
    expect(verifyStripeSignature(body, header, secret)).toBe(true);
  });

  it('rejects a tampered body', () => {
    const ts = Math.floor(Date.now() / 1000);
    const header = `t=${ts},v1=${sign(ts, body)}`;
    expect(verifyStripeSignature(body + 'x', header, secret)).toBe(false);
  });

  it('rejects wrong secret, missing header, and stale timestamp', () => {
    const ts = Math.floor(Date.now() / 1000);
    expect(verifyStripeSignature(body, `t=${ts},v1=${sign(ts, body, 'other')}`, secret)).toBe(false);
    expect(verifyStripeSignature(body, null, secret)).toBe(false);
    expect(verifyStripeSignature(body, '', secret)).toBe(false);
    const stale = ts - 10_000;
    expect(verifyStripeSignature(body, `t=${stale},v1=${sign(stale, body)}`, secret)).toBe(false);
  });

  it('returns false when no secret is configured', () => {
    const ts = Math.floor(Date.now() / 1000);
    expect(verifyStripeSignature(body, `t=${ts},v1=${sign(ts, body)}`, '')).toBe(false);
  });
});
