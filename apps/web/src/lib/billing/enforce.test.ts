import { describe, it, expect } from 'vitest';
import { enforceAiQuota, enforceStorageQuota, quotaExceededBody } from './enforce';
import { DEFAULT_TENANT } from '@/lib/tenancy/context';
import type { QuotaStatus } from './usage';

// Only DB-free paths are unit-tested: the PURE body builder, and the default-tenant
// pass-through (isMetered() is false for DEFAULT_TENANT → checkAiQuota/checkStorageQuota
// return unlimited+allowed with no DB access). The metered deny path is covered by
// integration once wired; here we assert the body shape a route sends on deny.

describe('enforceAiQuota / enforceStorageQuota — default tenant pass-through', () => {
  it('AI: default (self-hosted) tenant is always allowed, unlimited, no DB', async () => {
    const gate = await enforceAiQuota(DEFAULT_TENANT);
    expect(gate.allowed).toBe(true);
    expect(gate.status.limit).toBeNull();
    expect(gate.status.remaining).toBeNull();
  });

  it('storage: default tenant is always allowed even with a huge added upload', async () => {
    const gate = await enforceStorageQuota(DEFAULT_TENANT, 999 * 1024 * 1024 * 1024);
    expect(gate.allowed).toBe(true);
    expect(gate.status.limit).toBeNull();
  });
});

describe('quotaExceededBody', () => {
  const atCap: QuotaStatus = { used: 50, limit: 50, remaining: 0, allowed: false, ratio: 1 };

  it('builds a stable machine-readable AI over-quota body', () => {
    const body = quotaExceededBody('ai', atCap, 'free');
    expect(body).toEqual({
      error: 'AI usage limit reached for this plan',
      code: 'quota_exceeded',
      kind: 'ai',
      plan: 'free',
      used: 50,
      limit: 50,
      remaining: 0,
      upgrade: true,
    });
  });

  it('builds a storage over-quota body and tolerates a missing plan', () => {
    const status: QuotaStatus = { used: 6, limit: 5, remaining: 0, allowed: false, ratio: 1 };
    const body = quotaExceededBody('storage', status);
    expect(body.kind).toBe('storage');
    expect(body.error).toBe('storage limit reached for this plan');
    expect(body.code).toBe('quota_exceeded');
    expect(body.plan).toBeNull();
    expect(body.upgrade).toBe(true);
  });
});
