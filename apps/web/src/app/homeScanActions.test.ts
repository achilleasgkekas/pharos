import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HomeScanKind } from '@/lib/homeScan';
vi.mock('@/lib/auth', () => ({ assertCanWrite: vi.fn() }));
vi.mock('@/lib/aiFeatures.server', () => ({ isFeatureEnabled: vi.fn().mockResolvedValue(false) }));
vi.mock('@/lib/tenancy/request', () => ({ withRequestTenant: vi.fn((fn: () => unknown) => fn()) }));
vi.mock('@/lib/homeScan.server', () => ({ scanHomeFile: vi.fn() }));
import { isFeatureEnabled } from '@/lib/aiFeatures.server';
import { scanHomeFile } from '@/lib/homeScan.server';
import { scanHomeDocument } from './homeScanActions';
describe('scanHomeDocument feature gates', () => {
  beforeEach(() => vi.clearAllMocks());
  it.each(['constructor', 'toString', '__proto__', 'unknown'])('rejects unexpected kind %s before feature lookup', async (kind) => {
    expect(await scanHomeDocument(kind as HomeScanKind, new FormData())).toEqual({ ok: false, error: 'Unknown scan' });
    expect(isFeatureEnabled).not.toHaveBeenCalled();
    expect(scanHomeFile).not.toHaveBeenCalled();
  });
  it.each([['document', 'documents'], ['bill', 'bills'], ['meter', 'meters']] as const)('respects the %s feature toggle', async (kind, feature) => {
    expect(await scanHomeDocument(kind, new FormData())).toMatchObject({ ok: false });
    expect(isFeatureEnabled).toHaveBeenCalledWith(feature);
    expect(scanHomeFile).not.toHaveBeenCalled();
  });
});
