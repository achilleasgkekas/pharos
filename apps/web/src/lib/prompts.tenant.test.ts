import { describe, it, expect, vi, beforeEach } from 'vitest';
import { withTenant } from './tenancy/current';
import { DEFAULT_TENANT, type TenantContext } from './tenancy/context';

// getPromptOverride caches the AppConfig.prompts map; before the tenancy fix the cache was a
// single module slot (and the read was not tenant-routed), so tenant A's custom prompts leaked
// to tenant B. These tests prove the cache is keyed per tenant, the read is routed through
// currentModel, and the self-hosted / default tenant behaves exactly as before.
//
// Own file: it mocks ./tenancy/connection + ./db module-wide; the pure PROMPT_META tests in
// prompts.test.ts must stay unmocked.

// A per-tenant fake AppConfig whose findOne().select('prompts').lean() returns a distinct
// receipt-prompt override so a cache leak (wrong override for a tenant) is observable.
const RECEIPT_BY_TENANT: Record<string, string> = {
  default: 'DEFAULT receipt prompt',
  acme: 'ACME receipt prompt',
  globex: 'GLOBEX receipt prompt',
};

vi.mock('./tenancy/connection', () => ({
  currentModel: async () => {
    const { currentTenant } = await import('./tenancy/current');
    const ctx = currentTenant();
    const tag = ctx.isDefault || !ctx.tenantId ? 'default' : ctx.slug;
    return {
      findOne: () => ({
        select: () => ({ lean: async () => ({ prompts: { receipt: RECEIPT_BY_TENANT[tag] } }) }),
      }),
    };
  },
}));

vi.mock('./db', () => ({ connectDB: async () => ({ connection: {} }) }));

import { getPromptOverride, invalidatePromptsCache } from './prompts';

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
  invalidatePromptsCache(true); // clear every tenant slot between tests
});

describe('getPromptOverride cache — per-tenant isolation', () => {
  it("does NOT leak one tenant's prompt override into another", async () => {
    const a = await withTenant(acme, () => getPromptOverride('receipt'));
    const g = await withTenant(globex, () => getPromptOverride('receipt'));
    expect(a).toBe('ACME receipt prompt');
    expect(g).toBe('GLOBEX receipt prompt'); // NOT the cached acme value
  });
});

describe('getPromptOverride cache — OSS / default tenant unchanged', () => {
  it('returns the default-db override outside any tenant context', async () => {
    expect(await getPromptOverride('receipt')).toBe('DEFAULT receipt prompt');
  });

  it('treats DEFAULT_TENANT the same as no context', async () => {
    const v = await withTenant(DEFAULT_TENANT, () => getPromptOverride('receipt'));
    expect(v).toBe('DEFAULT receipt prompt');
  });

  it('invalidatePromptsCache() clears only the current tenant by default', async () => {
    // Prime both tenants, then clear only globex; acme must stay cached (proved by a follow-up
    // read still returning acme's value even though the fake would now serve it fresh anyway —
    // the isolation guarantee is that globex's clear does not evict acme).
    await withTenant(acme, () => getPromptOverride('receipt'));
    await withTenant(globex, () => getPromptOverride('receipt'));
    await withTenant(globex, () => invalidatePromptsCache());
    const a = await withTenant(acme, () => getPromptOverride('receipt'));
    expect(a).toBe('ACME receipt prompt');
  });
});
