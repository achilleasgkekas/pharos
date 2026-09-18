import { describe, it, expect, beforeEach, vi } from 'vitest';
import { withTenant } from '@/lib/tenancy/current';
import type { TenantContext } from '@/lib/tenancy/context';

const writes = new Map<string, { op: string; doc: Record<string, any> }[]>();

function log(tag: string, op: string, doc: Record<string, any>) {
  const list = writes.get(tag) ?? [];
  list.push({ op, doc });
  writes.set(tag, list);
}

const reads = new Map<string, string[]>();
function readLog(tag: string, op: string) {
  reads.set(tag, [...(reads.get(tag) ?? []), op]);
}

let trashDocs: Record<string, unknown>[] = [];

function writeChain(tag: string, op: string, doc: Record<string, any>) {
  log(tag, op, doc);
  const chain: any = {
    setOptions: () => chain,
    then: (res: any, rej: any) => Promise.resolve({ matchedCount: 1, deletedCount: 1 }).then(res, rej),
  };
  return chain;
}

function fakeModel(tag: string) {
  return {
    updateOne: (filter: Record<string, unknown>, update: Record<string, any>) =>
      writeChain(tag, 'updateOne', { filter, update }),
    deleteOne: (filter: Record<string, unknown>) => writeChain(tag, 'deleteOne', { filter }),
    updateMany: async (filter: Record<string, unknown>, update: Record<string, any>) => {
      log(tag, 'updateMany', { filter, update });
      return { matchedCount: 1 };
    },
    find: (filter: Record<string, unknown>) => {
      readLog(tag, 'find');
      const chain: any = { setOptions: () => chain, select: () => chain, lean: async () => trashDocs, filter };
      return chain;
    },
    findById: (id: unknown) => {
      readLog(tag, 'findById');
      const chain: any = { setOptions: () => chain, lean: async () => trashDocs[0] ?? null, id };
      return chain;
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

import { setAiEnabled, saveBudgets, getTrash, restoreFromTrash, purgeTrashEntry, emptyTrash, saveDefaults } from './actions';

const acme: TenantContext = {
  tenantId: '507f1f77bcf86cd799439011',
  slug: 'acme',
  dbName: 'tenant_acme',
  plan: 'shared',
  status: 'active',
  isDefault: false,
};
const globex: TenantContext = { ...acme, tenantId: '507f1f77bcf86cd799439022', slug: 'globex', dbName: 'tenant_globex' };

beforeEach(() => {
  writes.clear();
  reads.clear();
  trashDocs = [];
});

describe('settings write to the CURRENT workspace, not the shared default', () => {
  it('saveDefaults invalidates the correct tenant cache (bug #162)', async () => {
    // we must mock withRequestTenant to actually run with acme to simulate a server action context
    const reqMock = await import('@/lib/tenancy/request');
    const { withTenant } = await import('@/lib/tenancy/current');
    
    // Backup the old mock
    const oldWithRequestTenant = // @ts-ignore
    reqMock.withRequestTenant;
    
    // Simulate that softRequestTenant resolves to acme
    // @ts-ignore
    reqMock.softRequestTenant = async () => acme;
    // @ts-ignore
    reqMock.withRequestTenant = async (fn) => withTenant(acme, fn);
    
    const formData = new FormData();
    await saveDefaults(formData);
    
    // We expect the updateOne to land in 'acme'
    expect(writes.get('acme')).toBeDefined();
    
    // Restore the mocks
    // @ts-ignore
    reqMock.withRequestTenant = oldWithRequestTenant;
  });

  it('setAiEnabled lands in the caller workspace', async () => {
    await withTenant(acme, () => setAiEnabled(true));
    expect(writes.get('acme')).toHaveLength(1);
    expect(writes.get('default')).toBeUndefined();
  });
});
