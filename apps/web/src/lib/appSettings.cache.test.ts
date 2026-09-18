import { describe, it, expect, vi, beforeEach } from 'vitest';

// #162 — the settings cache is per workspace, and so must its eviction be.
//
// A settings server action reaches its models through a helper that opens and closes the tenant
// context per call, so by the time it invalidates there is NO ambient tenant. The read side already
// resolves the workspace from the request (softRequestTenant); the eviction did not, so a hosted
// customer's save cleared the DEFAULT slot: their own settings stayed cached and stale until the
// TTL ran out, while the self-hosted slot was dropped for nothing.

const { softRequestTenantMock, currentTenantMock, findOneLean } = vi.hoisted(() => ({
  softRequestTenantMock: vi.fn(async (): Promise<{ isDefault: boolean; tenantId: string | null }> => ({ isDefault: false, tenantId: "acme" })),
  currentTenantMock: vi.fn(() => ({ isDefault: true, tenantId: null })), // no ambient tenant: the bug's condition
  findOneLean: vi.fn(async () => ({ currency: "EUR" })),
}));

vi.mock('@/lib/db', () => ({ connectDB: vi.fn(async () => {}) }));
vi.mock('@/lib/tenancy/request', () => ({ softRequestTenant: softRequestTenantMock }));
vi.mock('@/lib/tenancy/current', () => ({ currentTenant: currentTenantMock }));
vi.mock('@/lib/tenancy/connection', () => ({
  tenantDb: vi.fn(async () => ({})),
  tenantModel: vi.fn(() => ({ findOne: () => ({ select: () => ({ lean: findOneLean }) }) })),
}));
vi.mock('@/models/AppConfig', () => ({ AppConfig: {} }));

import { getAppSettings, invalidateAppSettings, invalidateAppSettingsForRequest } from './appSettings';

beforeEach(() => {
  vi.clearAllMocks();
  invalidateAppSettings(true); // every slot, so each test starts cold
  softRequestTenantMock.mockResolvedValue({ isDefault: false, tenantId: "acme" });
});

describe('settings cache eviction follows the request, not the ambient tenant (#162)', () => {
  it('caches per workspace: a second read inside the TTL does not touch the database', async () => {
    await getAppSettings();
    await getAppSettings();
    expect(findOneLean).toHaveBeenCalledTimes(1);
  });

  it('THE ONE THAT MATTERS: invalidating without an ambient tenant still clears THIS workspace', async () => {
    await getAppSettings();
    await invalidateAppSettingsForRequest();
    await getAppSettings();
    expect(findOneLean).toHaveBeenCalledTimes(2);
  });

  it('the ambient-tenant version would have missed it — that is the bug it replaces', async () => {
    await getAppSettings();
    invalidateAppSettings();          // clears the default slot, because there is no ambient tenant
    await getAppSettings();
    expect(findOneLean).toHaveBeenCalledTimes(1);  // still the stale cached copy
  });

  it('self-hosted keeps working: no workspace means the default slot, and no throw', async () => {
    softRequestTenantMock.mockResolvedValue({ isDefault: true, tenantId: null });
    await getAppSettings();
    await expect(invalidateAppSettingsForRequest()).resolves.toBeUndefined();
    await getAppSettings();
    expect(findOneLean).toHaveBeenCalledTimes(2);
  });
});
