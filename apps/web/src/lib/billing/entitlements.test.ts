import { describe, it, expect } from 'vitest';
import {
  entitlementsFor,
  canUseAiFeature,
  withinStorage,
  withinAiQuota,
} from './entitlements';
import { PLAN_KEYS } from './plans';
import { AI_FEATURE_KEYS } from '@/lib/aiFeatures';

const GB = 1024 * 1024 * 1024;

describe('entitlementsFor', () => {
  it('resolves the free plan', () => {
    const e = entitlementsFor('free');
    expect(e.plan).toBe('free');
    expect(e.storageGB).toBe(5);
    expect(e.storageBytes).toBe(5 * GB);
    expect(e.aiCallsPerMonth).toBe(50);
    expect(e.customDomain).toBe(false);
    expect(e.tier).toBe('shared');
  });

  it('resolves the shared plan', () => {
    const e = entitlementsFor('shared');
    expect(e.plan).toBe('shared');
    expect(e.storageGB).toBe(50);
    expect(e.storageBytes).toBe(50 * GB);
    expect(e.aiCallsPerMonth).toBe(1000);
    expect(e.customDomain).toBe(false);
    expect(e.tier).toBe('shared');
  });

  it('resolves the dedicated plan (unlimited AI, custom domain, dedicated tier)', () => {
    const e = entitlementsFor('dedicated');
    expect(e.plan).toBe('dedicated');
    expect(e.storageGB).toBe(500);
    expect(e.storageBytes).toBe(500 * GB);
    expect(e.aiCallsPerMonth).toBeNull();
    expect(e.customDomain).toBe(true);
    expect(e.tier).toBe('dedicated');
  });

  it('falls back to free for unknown / legacy / empty / nullish plans', () => {
    for (const bad of ['enterprise', 'legacy-pro', '', 'FREE', null, undefined]) {
      expect(entitlementsFor(bad as string | null | undefined).plan).toBe('free');
    }
  });

  it('grants every AI feature on every plan (metered by volume, not locked)', () => {
    for (const key of PLAN_KEYS) {
      const e = entitlementsFor(key);
      expect(e.aiFeatures).toEqual([...AI_FEATURE_KEYS]);
      expect(e.aiFeatures.length).toBe(AI_FEATURE_KEYS.length);
    }
  });

  it('returns a fresh aiFeatures array (not a shared reference to the registry)', () => {
    const a = entitlementsFor('free').aiFeatures;
    const b = entitlementsFor('free').aiFeatures;
    expect(a).not.toBe(b);
    expect(a).not.toBe(AI_FEATURE_KEYS);
  });

  it('storageBytes is always storageGB expressed in bytes', () => {
    for (const key of PLAN_KEYS) {
      const e = entitlementsFor(key);
      expect(e.storageBytes).toBe(e.storageGB * GB);
    }
  });
});

describe('canUseAiFeature', () => {
  it('is true for every known feature on every plan (OSS parity: no per-feature lock)', () => {
    for (const plan of PLAN_KEYS) {
      for (const feat of AI_FEATURE_KEYS) {
        expect(canUseAiFeature(plan, feat)).toBe(true);
      }
    }
  });

  it('is true even on the free plan (unknown plan falls back to free)', () => {
    expect(canUseAiFeature('nonexistent', AI_FEATURE_KEYS[0])).toBe(true);
  });
});

describe('withinStorage', () => {
  it('allows usage at or below the plan allowance (boundary inclusive)', () => {
    expect(withinStorage('free', 0)).toBe(true);
    expect(withinStorage('free', 5 * GB)).toBe(true); // exactly at cap → allowed
    expect(withinStorage('free', 5 * GB - 1)).toBe(true);
  });

  it('rejects usage above the plan allowance', () => {
    expect(withinStorage('free', 5 * GB + 1)).toBe(false);
    expect(withinStorage('shared', 51 * GB)).toBe(false);
  });

  it('scales with the plan (shared allows more than free)', () => {
    const over = 10 * GB;
    expect(withinStorage('free', over)).toBe(false);
    expect(withinStorage('shared', over)).toBe(true);
  });

  it('unknown plan is treated as free for the storage cap', () => {
    expect(withinStorage('mystery', 6 * GB)).toBe(false);
  });
});

describe('withinAiQuota', () => {
  it('allows calls strictly below the monthly cap', () => {
    expect(withinAiQuota('free', 0)).toBe(true);
    expect(withinAiQuota('free', 49)).toBe(true);
  });

  it('rejects at or above the cap (exclusive upper bound)', () => {
    expect(withinAiQuota('free', 50)).toBe(false); // == cap → blocked
    expect(withinAiQuota('free', 51)).toBe(false);
    expect(withinAiQuota('shared', 1000)).toBe(false);
  });

  it('unlimited plans (aiCallsPerMonth === null) always allow', () => {
    expect(withinAiQuota('dedicated', 0)).toBe(true);
    expect(withinAiQuota('dedicated', 1_000_000)).toBe(true);
  });

  it('unknown plan is treated as free for the AI cap', () => {
    expect(withinAiQuota('mystery', 50)).toBe(false);
    expect(withinAiQuota('mystery', 10)).toBe(true);
  });
});
