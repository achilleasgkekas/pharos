import { describe, it, expect } from 'vitest';
import { periodOf, aiQuotaStatus, storageQuotaStatus } from './usage';

// Only the PURE helpers are unit-tested here (no DB). The DB-touching functions are
// exercised by integration once the metering is wired; their no-op/unlimited default-tenant
// path is guaranteed by isMetered() gating on saasMode()+isDefault.

const GB = 1024 * 1024 * 1024;

describe('periodOf', () => {
  it('formats YYYY-MM in UTC, zero-padded month', () => {
    expect(periodOf(new Date('2026-01-05T00:00:00Z'))).toBe('2026-01');
    expect(periodOf(new Date('2026-12-31T23:59:59Z'))).toBe('2026-12');
  });

  it('uses UTC, not local time, at month boundaries', () => {
    // 2026-03-01T00:30 UTC is still March in UTC regardless of the runner's timezone.
    expect(periodOf(new Date('2026-03-01T00:30:00Z'))).toBe('2026-03');
  });
});

describe('aiQuotaStatus', () => {
  it('free plan: 50 calls/month, blocks at the cap', () => {
    expect(aiQuotaStatus('free', 0)).toEqual({
      used: 0,
      limit: 50,
      remaining: 50,
      allowed: true,
      ratio: 0,
    });
    expect(aiQuotaStatus('free', 49)).toMatchObject({ remaining: 1, allowed: true });
    // At the cap: one more is NOT allowed (used < limit is false).
    expect(aiQuotaStatus('free', 50)).toMatchObject({ remaining: 0, allowed: false, ratio: 1 });
    expect(aiQuotaStatus('free', 60)).toMatchObject({ remaining: 0, allowed: false, ratio: 1 });
  });

  it('shared plan: 1000 calls/month', () => {
    expect(aiQuotaStatus('shared', 500)).toMatchObject({ limit: 1000, remaining: 500, allowed: true, ratio: 0.5 });
  });

  it('dedicated plan: unlimited (null limit, always allowed, ratio 0)', () => {
    expect(aiQuotaStatus('dedicated', 999999)).toEqual({
      used: 999999,
      limit: null,
      remaining: null,
      allowed: true,
      ratio: 0,
    });
  });

  it('unknown/legacy plan falls back to free', () => {
    expect(aiQuotaStatus('legacy-tier', 50)).toMatchObject({ limit: 50, allowed: false });
  });

  it('negative used is floored to 0', () => {
    expect(aiQuotaStatus('free', -5)).toMatchObject({ used: 0, remaining: 50 });
  });
});

describe('storageQuotaStatus', () => {
  it('free plan: 200 MB allowance', () => {
    expect(storageQuotaStatus('free', 0)).toMatchObject({ limit: 0.2 * GB, allowed: true, ratio: 0 });
    // Exactly at the cap is still within (withinStorage uses <=).
    expect(storageQuotaStatus('free', 0.2 * GB)).toMatchObject({ remaining: 0, allowed: true, ratio: 1 });
    // Over the cap blocks.
    expect(storageQuotaStatus('free', 0.2 * GB + 1)).toMatchObject({ allowed: false, remaining: 0 });
  });

  it('dedicated plan: 5 GB, half used', () => {
    expect(storageQuotaStatus('dedicated', 2.5 * GB)).toMatchObject({
      limit: 5 * GB,
      remaining: 2.5 * GB,
      allowed: true,
      ratio: 0.5,
    });
  });
});
