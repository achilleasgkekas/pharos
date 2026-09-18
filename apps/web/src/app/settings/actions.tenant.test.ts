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

// Reads are tracked separately so the write assertions above stay exactly as strict as they were.
const reads = new Map<string, string[]>();
function readLog(tag: string, op: string) {
  reads.set(tag, [...(reads.get(tag) ?? []), op]);
}

// What every fake `find()` returns. Set per test; the assertion is about which TAG the query
// landed on, not what came back.
let trashDocs: Record<string, unknown>[] = [];

/** Mongoose-ish chain: awaitable AND `.setOptions()`-able, the way the Trash actions call it. */
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
  invalidateAppSettingsForRequest: async () => {},
}));

import { setAiEnabled, saveBudgets, getTrash, restoreFromTrash, purgeTrashEntry, emptyTrash } from './actions';

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

// ── The Trash: the same bug, but at the sharp end ─────────────────────────────────────────────
//
// The other 65 actions in the file had already moved to `scoped()`; the five Trash actions were
// still reading `TRASH_MODELS[type]` straight, so in SaaS mode they listed, restored and
// PERMANENTLY DELETED out of the shared default database. Settings bleeding between customers is
// bad and fixable after the fact. `emptyTrash` sweeping another workspace's records is not.
const TASK_ID = '507f1f77bcf86cd799439033';

describe('the Trash acts on the CURRENT workspace only', () => {
  it('getTrash lists the caller workspace, never the shared default', async () => {
    await withTenant(acme, () => getTrash());

    // One find() per TRASH_MODELS type, all of them in acme's database.
    expect(reads.get('acme')).toHaveLength(11);
    expect(reads.get('default')).toBeUndefined();
  });

  it('restoreFromTrash un-deletes in the caller workspace', async () => {
    await withTenant(acme, () => restoreFromTrash('task', TASK_ID));

    expect(writes.get('acme')![0].doc.update).toEqual({ $set: { deletedAt: null } });
    expect(writes.get('default')).toBeUndefined();
  });

  it('purgeTrashEntry deletes for real, and only in the caller workspace', async () => {
    trashDocs = [{ _id: TASK_ID, title: 'a task' }];

    await withTenant(acme, () => purgeTrashEntry('task', TASK_ID));

    expect(writes.get('acme')!.map((w) => w.op)).toEqual(['deleteOne']);
    expect(writes.get('default')).toBeUndefined();
  });

  it('THE ONE THAT MATTERS: emptyTrash cannot reach another workspace', async () => {
    trashDocs = [{ _id: TASK_ID }];

    const r = await withTenant(acme, () => emptyTrash());

    // 11 types × (one doc found, one doc purged) — every delete tagged `acme`, and the
    // cross-reference cleanup that an item/receipt purge drags along tagged `acme` too.
    expect(r.purged).toBe(11);
    expect(writes.get('acme')!.filter((w) => w.op === 'deleteOne')).toHaveLength(11);
    expect(writes.get('globex')).toBeUndefined();
    expect(writes.get('default')).toBeUndefined();
  });

  it('SELF-HOSTED PARITY: with no workspace established the Trash still works on the default', async () => {
    trashDocs = [{ _id: TASK_ID }];

    const r = await emptyTrash();

    expect(r.purged).toBe(11);
    expect(writes.get('default')!.filter((w) => w.op === 'deleteOne')).toHaveLength(11);
    expect(writes.get('acme')).toBeUndefined();
  });
});
