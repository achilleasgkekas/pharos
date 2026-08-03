import { describe, it, expect, vi, beforeEach } from 'vitest';
import { withTenant } from '@/lib/tenancy/current';
import type { TenantContext } from '@/lib/tenancy/context';

// /shopping-list imported the ShoppingListItem model directly, so in SaaS mode every line the
// user typed (and every read of the list) landed in the DEFAULT tenant db no matter who was
// logged in. Same class as the money modules already closed before it; the REST layer inherits
// the bug too, since /api/v1/shopping-list calls these very actions.
//
// These tests pin the fix at the action layer: each exported action must reach its collection
// through `currentModel()` inside `withRequestTenant`, so the row lands in the CURRENT tenant db.
//
// (Own file, like the tasks/subscriptions/bills siblings: it mocks the tenancy seam tenant-AWARE,
// while actions.test.ts mocks it flat to pin the CRUD behaviour itself.)

type Write = { op: string; doc: Record<string, any> };
const writes = new Map<string, Write[]>();
// Rows the fake db hands back on a read, keyed by tenant tag.
const rows = new Map<string, Record<string, any>[]>();

function log(tag: string, op: string, doc: Record<string, any>) {
  const list = writes.get(tag) ?? [];
  list.push({ op, doc });
  writes.set(tag, list);
}

function makeListModel(tag: string) {
  return {
    __model: 'ShoppingListItem',
    find: () => ({
      sort: (sort: Record<string, number>) => ({
        lean: async () => {
          log(tag, 'find', { sort });
          return rows.get(tag) ?? [];
        },
      }),
    }),
    create: async (doc: Record<string, any>) => {
      log(tag, 'create', doc);
      return { _id: `${tag}-list1` };
    },
    updateOne: async (filter: Record<string, unknown>, update: Record<string, any>) => {
      log(tag, 'updateOne', { filter, update });
      return { matchedCount: 1 };
    },
    updateMany: async (filter: Record<string, unknown>, update: Record<string, any>) => {
      log(tag, 'updateMany', { filter, update });
      return { modifiedCount: 2 };
    },
  };
}

// The seam is tagged by tenant: `currentModel` is handed the real model object, so a resolution
// that ignores the ambient tenant shows up as a wrong tag rather than silently passing.
vi.mock('@/lib/tenancy/connection', () => ({
  currentModel: async (_model: unknown) => {
    const { currentTenant } = await import('@/lib/tenancy/current');
    const ctx = currentTenant();
    return makeListModel(ctx.isDefault || !ctx.tenantId ? 'default' : ctx.slug);
  },
}));
// The real wrapper resolves the tenant from request headers (none in a unit test), so run the
// body inside whatever tenant the test established with `withTenant`.
vi.mock('@/lib/tenancy/request', () => ({ withRequestTenant: async (fn: () => Promise<any>) => fn() }));
vi.mock('@/lib/db', () => ({ connectDB: async () => {} }));
vi.mock('@/models/ShoppingListItem', () => ({ ShoppingListItem: { __kind: 'ShoppingListItem' } }));
vi.mock('@/lib/auth', () => ({ assertCanWrite: async () => {} }));
vi.mock('@/lib/aiFeatures.server', () => ({ isFeatureEnabled: async () => true }));
vi.mock('@/lib/ollama', () => ({ parseProductPhoto: async () => ({ parsed: { name: 'Milk' }, raw: '{}', model: 'test' }) }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

import { getListItems, addListItem, updateListItem, toggleListItem, deleteListItem, clearChecked } from './actions';

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
  plan: 'shared',
  status: 'active',
  isDefault: false,
};

beforeEach(() => {
  writes.clear();
  rows.clear();
});

describe('shopping-list actions — tenant routing', () => {
  it('addListItem writes into the CURRENT tenant db, not the default one', async () => {
    const res = await withTenant(acme, () => addListItem({ name: '  Eggs  ', quantity: '12' }));

    expect(res).toEqual({ ok: true });
    expect(writes.get('acme')?.map((w) => w.op)).toEqual(['create']);
    expect(writes.get('acme')?.[0].doc).toMatchObject({ name: 'Eggs', quantity: '12', checked: false });
    expect(writes.get('default')).toBeUndefined();
    expect(writes.get('globex')).toBeUndefined();
  });

  it('two tenants adding lines never see each other writes', async () => {
    await withTenant(acme, () => addListItem({ name: 'Acme milk' }));
    await withTenant(globex, () => addListItem({ name: 'Globex milk' }));

    expect(writes.get('acme')?.map((w) => w.doc.name)).toEqual(['Acme milk']);
    expect(writes.get('globex')?.map((w) => w.doc.name)).toEqual(['Globex milk']);
    expect(writes.get('default')).toBeUndefined();
  });

  it('getListItems reads the CURRENT tenant list (the read path is scoped too)', async () => {
    rows.set('acme', [{ _id: 'a1', name: 'Acme bread', createdAt: new Date('2026-01-01T00:00:00Z') }]);
    rows.set('globex', [{ _id: 'g1', name: 'Globex bread', createdAt: new Date('2026-01-01T00:00:00Z') }]);

    const mine = await withTenant(acme, () => getListItems());

    // The rows came out of acme's collection, so a read answered by the wrong db is visible here.
    expect(mine.map((i) => i.name)).toEqual(['Acme bread']);
    expect(writes.get('acme')?.[0].doc.sort).toEqual({ checked: 1, createdAt: -1 });
    expect(writes.get('default')).toBeUndefined();
  });

  it('updateListItem and toggleListItem edit inside the current tenant', async () => {
    await withTenant(acme, () => updateListItem('l1', { name: '  Bread  ' }));
    await withTenant(globex, () => toggleListItem('l2', true));

    expect(writes.get('acme')?.map((w) => w.op)).toEqual(['updateOne']);
    expect(writes.get('acme')?.[0].doc.filter).toEqual({ _id: 'l1' });
    expect(writes.get('acme')?.[0].doc.update.$set).toEqual({ name: 'Bread' });
    expect(writes.get('globex')?.[0].doc.update.$set).toEqual({ checked: true });
    expect(writes.get('default')).toBeUndefined();
  });

  it('deleteListItem and clearChecked soft-delete inside the current tenant', async () => {
    const cleared = await withTenant(globex, async () => {
      await deleteListItem('l9');
      return clearChecked();
    });

    expect(cleared).toEqual({ ok: true, cleared: 2 });
    expect(writes.get('globex')?.map((w) => w.op)).toEqual(['updateOne', 'updateMany']);
    expect(writes.get('globex')?.[0].doc.update.$set.deletedAt).toBeInstanceOf(Date);
    expect(writes.get('globex')?.[1].doc.filter).toEqual({ checked: true });
    expect(writes.get('default')).toBeUndefined();
    expect(writes.get('acme')).toBeUndefined();
  });

  it('a blank addListItem short-circuits before touching any db', async () => {
    const res = await withTenant(acme, () => addListItem({ name: '   ' }));

    expect(res.ok).toBe(false);
    expect(writes.size).toBe(0);
  });

  it('self-hosted (no tenant established) still resolves to the default db', async () => {
    await addListItem({ name: 'Self-hosted milk' });

    expect(writes.get('default')?.map((w) => w.doc.name)).toEqual(['Self-hosted milk']);
    expect(writes.get('acme')).toBeUndefined();
  });
});
