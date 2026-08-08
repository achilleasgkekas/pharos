import { describe, it, expect, vi, beforeEach } from 'vitest';
import { withTenant } from './tenancy/current';
import { DEFAULT_TENANT, type TenantContext } from './tenancy/context';

// getAiConfig caches the AppConfig singleton; before the tenancy fix the cache was a single
// module slot (and the AppConfig read was not tenant-routed), so tenant A's AI provider +
// API keys leaked to tenant B. These tests prove the cache is keyed per tenant, the AppConfig
// read is routed per tenant, and the self-hosted / default tenant behaves exactly as
// before.
//
// Own file: it mocks ./tenancy/connection + ./db module-wide; the pure isVisionModel tests in
// aiConfig.test.ts must stay unmocked.

// A per-tenant fake AppConfig whose findOne returns a distinct anthropic key so a cache leak
// (wrong key for a tenant) is observable.
const KEY_BY_TENANT: Record<string, string> = {
  default: 'sk-default',
  acme: 'sk-acme',
  globex: 'sk-globex',
};

// getAiConfig binds the model through `tenantModel(await tenantDb(ctx), AppConfig)` rather than
// `currentModel`, so that it can honour a tenant resolved from the HOST when no gate is open
// (the root layout's "AI online" dot). The mock follows that pair: tenantDb just carries the
// context through, tenantModel turns it into the per-tenant fake.
vi.mock('./tenancy/connection', () => ({
  tenantDb: async (ctx: { isDefault?: boolean; tenantId?: string; slug?: string }) => ctx,
  tenantModel: (conn: { isDefault?: boolean; tenantId?: string; slug?: string }) => {
    const tag = conn.isDefault || !conn.tenantId ? 'default' : conn.slug!;
    return {
      findOne: () => ({
        lean: async () => ({ aiProvider: 'anthropic', anthropicApiKey: KEY_BY_TENANT[tag] }),
      }),
    };
  },
}));

vi.mock('./db', () => ({ connectDB: async () => ({ connection: {} }) }));

// A non-default tenant now also resolves its BYO key from the control plane. Unmocked, the
// real module reaches for the Tenant collection and these tests hang on a query that never
// answers. Stubbed to "no stored key", which is the behaviour these cache tests assume.
vi.mock('./billing/byoKeyStore', () => ({ resolveTenantAiKey: async () => null }));
// Same reason, and it is not optional: "no BYO key" now falls through to the OPERATOR's
// platform key, so leaving this one real puts an unanswerable control-plane query on the path.
// The 3s BYO_KEY_TIMEOUT_MS race then eats a test's whole budget — two tenants per test is 6s
// against a 5s timeout, which is exactly how these two started failing while the single-tenant
// one merely got slow (3003ms). A stubbed miss is what the cache tests mean by "no stored key".
vi.mock('./billing/platformKeyStore', () => ({ resolvePlatformAiKey: async () => null }));

import { getAiConfig, invalidateAiConfigCache } from './aiConfig';

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
  invalidateAiConfigCache(true); // clear every tenant slot between tests
});

describe('getAiConfig cache — per-tenant isolation', () => {
  it("does NOT leak one tenant's API key into another", async () => {
    const a = await withTenant(acme, () => getAiConfig());
    const g = await withTenant(globex, () => getAiConfig());
    expect(a.anthropicApiKey).toBe('sk-acme');
    expect(g.anthropicApiKey).toBe('sk-globex'); // NOT the cached acme value
    expect(a.provider).toBe('anthropic');
  });

  it('serves the same tenant from cache on the second call', async () => {
    const first = await withTenant(acme, () => getAiConfig());
    const second = await withTenant(acme, () => getAiConfig());
    expect(second).toBe(first); // identical cached reference (same tenant key)
  });
});

describe('getAiConfig cache — OSS / default tenant unchanged', () => {
  it('returns the default-db config outside any tenant context', async () => {
    const c = await getAiConfig();
    expect(c.anthropicApiKey).toBe('sk-default');
  });

  it('treats DEFAULT_TENANT the same as no context', async () => {
    const c = await withTenant(DEFAULT_TENANT, () => getAiConfig());
    expect(c.anthropicApiKey).toBe('sk-default');
  });

  it('invalidateAiConfigCache() clears only the current tenant by default', async () => {
    const a1 = await withTenant(acme, () => getAiConfig());
    await withTenant(globex, () => getAiConfig());
    await withTenant(globex, () => invalidateAiConfigCache());
    const a2 = await withTenant(acme, () => getAiConfig());
    expect(a2).toBe(a1); // acme still cached (same reference)
  });
});
