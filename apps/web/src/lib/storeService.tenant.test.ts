import { describe, it, expect, vi, beforeEach } from 'vitest';
import { withTenant } from './tenancy/current';
import { DEFAULT_TENANT, type TenantContext } from './tenancy/context';

// storeService caches the store list; before the tenancy fix the cache was a single module
// slot, so tenant A's stores leaked to tenant B. These tests prove the cache is keyed per
// tenant (default tenant behaves exactly as before) and that the model is routed through
// currentModel so SaaS reads hit the tenant db.
//
// (This lives in its own file because it mocks ./tenancy/connection + ./db module-wide; the
// pure matchIn tests in storeService.test.ts must stay unmocked.)

// A per-tenant fake Store model: find() returns rows tagged with which db it came from, so a
// cache leak (wrong rows for a tenant) is observable.
function makeStoreModel(tag: string) {
  return {
    find: () => ({ sort: () => ({ lean: async () => [{ _id: `${tag}-1`, name: `${tag} Store`, aliases: [], url: '', auto: false }] }) }),
    insertMany: async () => {},
    create: async () => {},
  };
}

// currentModel(Store) → the fake model for the current tenant. Reads the ambient tenant to
// pick the right fake model — mirrors real per-db routing.
vi.mock('./tenancy/connection', () => ({
  currentModel: async () => {
    const { currentTenant } = await import('./tenancy/current');
    const ctx = currentTenant();
    const tag = ctx.isDefault || !ctx.tenantId ? 'default' : ctx.slug;
    return makeStoreModel(tag);
  },
}));

vi.mock('./db', () => ({ connectDB: async () => ({ connection: {} }) }));
vi.mock('./appSettings', () => ({ getAppSettings: async () => ({ autoAddStores: false }) }));

import { getStores, invalidateStoreCache } from './storeService';

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
  invalidateStoreCache(true); // clear every tenant slot between tests
});

describe('storeService cache — per-tenant isolation', () => {
  it("does NOT leak one tenant's stores into another", async () => {
    const acmeStores = await withTenant(acme, () => getStores());
    const globexStores = await withTenant(globex, () => getStores());

    expect(acmeStores[0].name).toBe('acme Store');
    expect(globexStores[0].name).toBe('globex Store'); // NOT the cached acme value
  });

  it('serves the same tenant from cache on the second call', async () => {
    const first = await withTenant(acme, () => getStores());
    const second = await withTenant(acme, () => getStores());
    expect(second).toBe(first); // identical cached reference (same tenant key)
  });
});

describe('storeService cache — OSS / default tenant unchanged', () => {
  it('returns the default-db stores outside any tenant context', async () => {
    const stores = await getStores();
    expect(stores[0].name).toBe('default Store');
  });

  it('treats DEFAULT_TENANT the same as no context', async () => {
    const stores = await withTenant(DEFAULT_TENANT, () => getStores());
    expect(stores[0].name).toBe('default Store');
  });

  it('invalidateStoreCache() clears only the current tenant by default', async () => {
    const a1 = await withTenant(acme, () => getStores());
    await withTenant(globex, () => getStores());
    // Clear only globex's slot; acme stays cached.
    await withTenant(globex, () => invalidateStoreCache());
    const a2 = await withTenant(acme, () => getStores());
    expect(a2).toBe(a1); // acme still cached (same reference)
  });
});
