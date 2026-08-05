import { describe, it, expect } from 'vitest';
import { StorageQuotaExceededError, assertStorageQuota, recordStorageDelta } from '@/lib/billing/storageMeter';

// storageMeter ties the request-scoped current tenant to the usage ledger + plan cap — the
// storage-quota mirror of aiMeter.ts. These tests exercise the DB-free paths: outside any
// withTenant the ambient tenant is DEFAULT_TENANT, which usage.ts/enforce.ts treat as unmetered
// + unlimited with NO database access. So assertStorageQuota must never throw and
// recordStorageDelta must be a no-op that never throws — exactly the self-hosted / OSS-parity
// behaviour lib/storage.ts's saveFile/deleteFile now depend on. The metered deny path (a real
// SaaS tenant over quota) is covered by integration once a tenant context is established; here
// only the error SHAPE is pure-tested.

describe('assertStorageQuota (default tenant / self-hosted path)', () => {
  it('resolves without throwing when no tenant context is established, any size', async () => {
    // No withTenant → DEFAULT_TENANT → unlimited, allowed, no DB touched.
    await expect(assertStorageQuota(0)).resolves.toBeUndefined();
    await expect(assertStorageQuota(999 * 1024 * 1024 * 1024)).resolves.toBeUndefined();
  });
});

describe('recordStorageDelta (default tenant / self-hosted path)', () => {
  it('is a no-op that resolves without touching the ledger, positive or negative delta', async () => {
    await expect(recordStorageDelta(1024)).resolves.toBeUndefined();
    await expect(recordStorageDelta(-1024)).resolves.toBeUndefined();
    await expect(recordStorageDelta(0)).resolves.toBeUndefined();
  });
});

describe('StorageQuotaExceededError (pure shape)', () => {
  it('carries the quota figures and a human message', () => {
    const e = new StorageQuotaExceededError('free', 200 * 1024 * 1024, 200 * 1024 * 1024, 0);
    expect(e.code).toBe('quota_exceeded');
    expect(e.plan).toBe('free');
    expect(e.used).toBe(200 * 1024 * 1024);
    expect(e.limit).toBe(200 * 1024 * 1024);
    expect(e.remaining).toBe(0);
    expect(e.message).toMatch(/storage limit reached/i);
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('StorageQuotaExceededError');
  });
});
