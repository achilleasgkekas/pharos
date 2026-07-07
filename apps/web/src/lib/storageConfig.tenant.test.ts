import { describe, it, expect, vi, beforeEach } from 'vitest';
import { withTenant } from './tenancy/current';
import { DEFAULT_TENANT, type TenantContext } from './tenancy/context';

// getStorageConfig caches the AppConfig singleton; before the tenancy fix the cache was a
// single module slot (and the read was not tenant-routed), so tenant A's storage backend +
// remote credentials leaked to tenant B. These tests prove the cache is keyed per tenant, the
// read is routed through currentModel, and the self-hosted / default tenant behaves exactly as
// before.
//
// Own file: it mocks ./tenancy/connection + ./db module-wide; the pure normalizeStorageConfig
// tests in storageConfig.test.ts must stay unmocked.

// A per-tenant fake AppConfig whose findOne().lean() returns a distinct backend + remote host
// so a cache leak (wrong storage target for a tenant) is observable.
const DOC_BY_TENANT: Record<string, { storageBackend: string; remoteHost: string }> = {
  default: { storageBackend: 'local', remoteHost: '' },
  acme: { storageBackend: 'smb', remoteHost: 'acme-nas.local' },
  globex: { storageBackend: 'ftp', remoteHost: 'globex-ftp.local' },
};

vi.mock('./tenancy/connection', () => ({
  currentModel: async () => {
    const { currentTenant } = await import('./tenancy/current');
    const ctx = currentTenant();
    const tag = ctx.isDefault || !ctx.tenantId ? 'default' : ctx.slug;
    return { findOne: () => ({ lean: async () => DOC_BY_TENANT[tag] }) };
  },
}));

vi.mock('./db', () => ({ connectDB: async () => ({ connection: {} }) }));

import { getStorageConfig, invalidateStorageConfig } from './storageConfig';

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
  invalidateStorageConfig(true); // clear every tenant slot between tests
});

describe('getStorageConfig cache — per-tenant isolation', () => {
  it("does NOT leak one tenant's storage backend/credentials into another", async () => {
    const a = await withTenant(acme, () => getStorageConfig());
    const g = await withTenant(globex, () => getStorageConfig());
    expect(a.backend).toBe('smb');
    expect(a.remote.host).toBe('acme-nas.local');
    expect(g.backend).toBe('ftp'); // NOT the cached acme value
    expect(g.remote.host).toBe('globex-ftp.local');
  });

  it('serves the same tenant from cache on the second call', async () => {
    const first = await withTenant(acme, () => getStorageConfig());
    const second = await withTenant(acme, () => getStorageConfig());
    expect(second).toBe(first); // identical cached reference (same tenant key)
  });
});

describe('getStorageConfig cache — OSS / default tenant unchanged', () => {
  it('returns the default-db config (local backend) outside any tenant context', async () => {
    const c = await getStorageConfig();
    expect(c.backend).toBe('local');
  });

  it('treats DEFAULT_TENANT the same as no context', async () => {
    const c = await withTenant(DEFAULT_TENANT, () => getStorageConfig());
    expect(c.backend).toBe('local');
  });

  it('invalidateStorageConfig() clears only the current tenant by default', async () => {
    const a1 = await withTenant(acme, () => getStorageConfig());
    await withTenant(globex, () => getStorageConfig());
    await withTenant(globex, () => invalidateStorageConfig());
    const a2 = await withTenant(acme, () => getStorageConfig());
    expect(a2).toBe(a1); // acme still cached (same reference)
  });
});
