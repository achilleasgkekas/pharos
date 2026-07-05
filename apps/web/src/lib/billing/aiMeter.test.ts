import { describe, it, expect } from 'vitest';
import { AiQuotaExceededError, assertAiQuota, meterAiResult } from '@/lib/billing/aiMeter';
import { aiQuotaResponse } from '@/lib/billing/enforce';

// aiMeter ties the request-scoped current tenant to the usage ledger + plan cap. These tests
// exercise the DB-free paths: outside any withTenant the ambient tenant is DEFAULT_TENANT,
// which usage.ts/enforce.ts treat as unmetered + unlimited with NO database access. So
// assertAiQuota must never throw and meterAiResult must be a no-op that never throws —
// exactly the self-hosted / OSS-parity behaviour. The error-shape + 402 translation is pure.

describe('assertAiQuota (default tenant / self-hosted path)', () => {
  it('resolves without throwing when no tenant context is established', async () => {
    // No withTenant → DEFAULT_TENANT → unlimited, allowed, no DB touched.
    await expect(assertAiQuota()).resolves.toBeUndefined();
  });
});

describe('meterAiResult (default tenant / self-hosted path)', () => {
  it('is a no-op that resolves without touching the ledger', async () => {
    await expect(meterAiResult()).resolves.toBeUndefined();
    await expect(meterAiResult({ inputTokens: 100, outputTokens: 50 })).resolves.toBeUndefined();
  });
});

describe('AiQuotaExceededError → aiQuotaResponse (pure 402 translation)', () => {
  it('carries the quota figures on the error', () => {
    const e = new AiQuotaExceededError('shared', 1000, 1000, 0);
    expect(e.code).toBe('quota_exceeded');
    expect(e.plan).toBe('shared');
    expect(e.used).toBe(1000);
    expect(e.limit).toBe(1000);
    expect(e.remaining).toBe(0);
    expect(e).toBeInstanceOf(Error);
  });

  it('translates the error into a 402 quota_exceeded body', async () => {
    const e = new AiQuotaExceededError('shared', 1000, 1000, 0);
    const res = aiQuotaResponse(e);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(402);
    const body = (await res!.json()) as Record<string, unknown>;
    expect(body.code).toBe('quota_exceeded');
    expect(body.kind).toBe('ai');
    expect(body.plan).toBe('shared');
    expect(body.used).toBe(1000);
    expect(body.limit).toBe(1000);
    expect(body.upgrade).toBe(true);
  });

  it('returns null for an unrelated error so the caller re-throws', () => {
    expect(aiQuotaResponse(new Error('network down'))).toBeNull();
    expect(aiQuotaResponse(null)).toBeNull();
    expect(aiQuotaResponse({ code: 'something_else' })).toBeNull();
  });
});
