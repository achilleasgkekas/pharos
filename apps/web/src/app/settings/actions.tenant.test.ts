import { describe, it, expect, beforeEach, vi } from 'vitest';
import { withTenant } from '@/lib/tenancy/current';
import type { TenantContext } from '@/lib/tenancy/context';

// settings/actions.ts reached its models directly, so in SaaS mode a workspace's Settings page
// read and wrote the DEFAULT database. Currency, budgets, AI prompts and keys, notifiers, stores
// and payment cards were SHARED across every customer. Invisible with one workspace; the day a
// second one exists, their settings are each other's.
//
// The seam is TAGGED by tenant, so an action that ignores the ambient workspace shows up as a
// write against the wrong tag rather than silently passing.
//
// (Sibling convention: the other settings.*.test.ts files mock the same seam FLAT to pin
// behaviour; this one mocks it tenant-aware to pin ROUTING.)

const writes = new Map<string, { op: string; doc: Record<string, any> }[]>();

function log(tag: string, op: string, doc: Record<string, any>) {
  const list = writes.get(tag) ?? [];
  list.push({ op, doc });
  writes.set(tag, list);
}

function fakeModel(tag: string) {
  return {
    updateOne: async (filter: Record<string, unknown>, update: Record<string, any>) => {
      log(tag, 'updateOne', { filter, update });
      return { matchedCount: 1 };
    },
    findOne: () => ({ select: () => ({ lean: async () => null }), lean: async () => null }),
  };
}

vi.mock('@/lib/tenancy/connection', () => ({
  currentModel: async (_m: unknown) => {
    const { currentTenant } = await import('@/lib/tenancy/current');
    const ctx = currentTenant();
    return fakeModel(ctx.isDefault || !ctx.tenantId ? 'default' : ctx.slug);
  },
  tenantDb: async () => ({}),
  tenantModel: (_c: unknown, m: unknown) => m,
}));
// The real wrapper resolves from request headers (none in a unit test), so run the body inside
// whatever workspace the test established.
vi.mock('@/lib/tenancy/request', () => ({
  withRequestTenant: async (fn: () => Promise<any>) => fn(),
  softRequestTenant: async () => {
    const { currentTenant } = await import('@/lib/tenancy/current');
    return currentTenant();
  },
}));
vi.mock('@/lib/db', () => ({ connectDB: async () => {} }));
vi.mock('@/lib/auth', () => ({
  requireAdmin: async () => ({ id: 'u1', role: 'admin', name: 'a' }),
  assertCanWrite: async () => {},
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('@/lib/appSettings', () => ({
  getAppSettings: async () => ({ currency: 'EUR' }),
  invalidateAppSettings: () => {},
}));

import { setAiEnabled, saveBudgets } from './actions';

const acme: TenantContext = {
  tenantId: '507f1f77bcf86cd799439011',
  slug: 'acme',
  dbName: 'tenant_acme',
  plan: 'shared',
  status: 'active',
  isDefault: false,
};
const globex: TenantContext = { ...acme, tenantId: '507f1f77bcf86cd799439022', slug: 'globex', dbName: 'tenant_globex' };

beforeEach(() => writes.clear());

describe('settings write to the CURRENT workspace, not the shared default', () => {
  it('setAiEnabled lands in the caller workspace', async () => {
    await withTenant(acme, () => setAiEnabled(true));

    expect(writes.get('acme')).toHaveLength(1);
    expect(writes.get('default')).toBeUndefined();
  });

  it('saveBudgets lands in the caller workspace', async () => {
    await withTenant(acme, () => saveBudgets({ groceries: 300 }));

    expect(writes.get('acme')).toHaveLength(1);
    expect(writes.get('default')).toBeUndefined();
  });

  it('two workspaces never write into each other, back to back in one process', async () => {
    // The failure this guards against is ambient state leaking between requests: the first write
    // lands correctly and the second follows it into the same database.
    await withTenant(acme, () => setAiEnabled(true));
    await withTenant(globex, () => setAiEnabled(false));

    expect(writes.get('acme')![0].doc.update.$set.aiEnabled).toBe(true);
    expect(writes.get('globex')![0].doc.update.$set.aiEnabled).toBe(false);
  });

  it('SELF-HOSTED PARITY: with no workspace established everything still goes to the default', async () => {
    await setAiEnabled(true);

    expect(writes.get('default')).toHaveLength(1);
    expect(writes.get('acme')).toBeUndefined();
  });
});
