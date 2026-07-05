import { describe, it, expect, vi, beforeEach } from 'vitest';
import { withTenant } from './tenancy/current';
import { DEFAULT_TENANT, type TenantContext } from './tenancy/context';

// getAppSettings caches the AppConfig singleton; before the tenancy fix the cache was a
// single module slot (and the AppConfig read was not tenant-routed), so tenant A's settings
// — including its currency — leaked to tenant B. These tests prove the cache is keyed per
// tenant, the AppConfig read is routed through currentModel, and the currency symbol resolves
// per tenant. The self-hosted / default tenant behaves exactly as before.
//
// Own file: it mocks ./tenancy/connection + ./db module-wide; the pure normalizeSettings /
// numMap tests in appSettings.test.ts must stay unmocked.

// currentModel(AppConfig) → a fake config model whose findOne returns a currency keyed by the
// ambient tenant, so a cache leak (wrong currency for a tenant) is observable.
const CURRENCY_BY_TENANT: Record<string, string> = {
  default: 'EUR',
  acme: 'USD',
  globex: 'GBP',
};

vi.mock('./tenancy/connection', () => ({
  currentModel: async () => {
    const { currentTenant } = await import('./tenancy/current');
    const ctx = currentTenant();
    const tag = ctx.isDefault || !ctx.tenantId ? 'default' : ctx.slug;
    return {
      findOne: () => ({
        select: () => ({ lean: async () => ({ currency: CURRENCY_BY_TENANT[tag] }) }),
      }),
    };
  },
}));

vi.mock('./db', () => ({ connectDB: async () => ({ connection: {} }) }));

import { getAppSettings, invalidateAppSettings } from './appSettings';
import { cur } from './money';

const acme: TenantContext = {
  tenantId: '507f1f77bcf86cd799439011',
  slug: 'acme',
  dbName: 'tenant_acme',
  plan: 'shared',
  status: 'active',
  isDefault: false,
};

const globex: TenantContext = {
  tenantId: '507f1f77bcf86cd799439012',
  slug: 'globex',
  dbName: 'tenant_globex',
  plan: 'dedicated',
  status: 'active',
  isDefault: false,
};

beforeEach(() => {
  invalidateAppSettings(true); // clear every tenant slot between tests
});

describe('getAppSettings cache — per-tenant isolation', () => {
  it("does NOT leak one tenant's settings into another", async () => {
    const a = await withTenant(acme, () => getAppSettings());
    const g = await withTenant(globex, () => getAppSettings());
    expect(a.currency).toBe('USD');
    expect(g.currency).toBe('GBP'); // NOT the cached acme value
  });

  it('resolves the currency symbol per tenant (cur() reads the right one)', async () => {
    // getAppSettings calls setCurrencySymbol for the ambient tenant; cur() must reflect it
    // within that tenant's scope and stay isolated from other tenants.
    const acmeSym = await withTenant(acme, async () => {
      await getAppSettings();
      return cur();
    });
    const globexSym = await withTenant(globex, async () => {
      await getAppSettings();
      return cur();
    });
    expect(acmeSym).toBe('$');
    expect(globexSym).toBe('£');
  });

  it('serves the same tenant from cache on the second call', async () => {
    const first = await withTenant(acme, () => getAppSettings());
    const second = await withTenant(acme, () => getAppSettings());
    expect(second).toBe(first); // identical cached reference (same tenant key)
  });
});

describe('getAppSettings cache — OSS / default tenant unchanged', () => {
  it('returns the default-db settings outside any tenant context', async () => {
    const s = await getAppSettings();
    expect(s.currency).toBe('EUR');
  });

  it('treats DEFAULT_TENANT the same as no context', async () => {
    const s = await withTenant(DEFAULT_TENANT, () => getAppSettings());
    expect(s.currency).toBe('EUR');
  });

  it('invalidateAppSettings() clears only the current tenant by default', async () => {
    const a1 = await withTenant(acme, () => getAppSettings());
    await withTenant(globex, () => getAppSettings());
    await withTenant(globex, () => invalidateAppSettings());
    const a2 = await withTenant(acme, () => getAppSettings());
    expect(a2).toBe(a1); // acme still cached (same reference)
  });
});
