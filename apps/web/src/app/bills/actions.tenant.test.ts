import { describe, it, expect, vi, beforeEach } from 'vitest';
import { withTenant } from '@/lib/tenancy/current';
import type { TenantContext } from '@/lib/tenancy/context';

// Bills CRUD used to import the Bill model directly, so in SaaS mode every read and write went
// to the DEFAULT tenant db no matter who was logged in. These tests pin the fix at the action
// layer: each exported action must reach its collection through `currentModel()` inside
// `withRequestTenant`, so the row lands in (and comes back from) the CURRENT tenant's db.
//
// (Own file, like lib/*.tenant.test.ts: it mocks the tenancy seam tenant-aware, while
// actions.test.ts mocks it flat to pin the CRUD/lifecycle behaviour itself.)

// One fake Bill model per tenant, tagged with the tenant it belongs to. Every write records
// into that tenant's own log, so a leak to the wrong db is directly observable.
type Write = { op: string; doc: Record<string, any> };
const writes = new Map<string, Write[]>();
const seeded = new Map<string, Record<string, any>>();

function log(tag: string, op: string, doc: Record<string, any>) {
  const list = writes.get(tag) ?? [];
  list.push({ op, doc });
  writes.set(tag, list);
}

function makeBillModel(tag: string) {
  return {
    create: async (doc: Record<string, any>) => {
      log(tag, 'create', doc);
      return doc;
    },
    // Reads are tagged too: a bill "found" here says which db answered.
    findById: (id: string) => ({
      lean: async () => seeded.get(tag) ?? { _id: id, title: `${tag} bill`, amount: 10, tenantTag: tag },
    }),
    // #33 successor lookup before a recurring spawn: no live successor in any db here.
    findOne: () => ({ lean: async () => null }),
    findByIdAndUpdate: async (id: string, update: Record<string, any>) => {
      log(tag, 'findByIdAndUpdate', { id, ...update });
      return update;
    },
    updateOne: async (filter: Record<string, any>, update: Record<string, any>) => {
      log(tag, 'updateOne', { filter, update });
      return update;
    },
  };
}

vi.mock('@/lib/tenancy/connection', () => ({
  currentModel: async () => {
    const { currentTenant } = await import('@/lib/tenancy/current');
    const ctx = currentTenant();
    return makeBillModel(ctx.isDefault || !ctx.tenantId ? 'default' : ctx.slug);
  },
}));
// The real wrapper resolves the tenant from request headers (none in a unit test), so run the
// body inside whatever tenant the test established with `withTenant`.
vi.mock('@/lib/tenancy/request', () => ({ withRequestTenant: async (fn: () => Promise<any>) => fn() }));
vi.mock('@/lib/db', () => ({ connectDB: async () => {} }));
vi.mock('@/models/Bill', () => ({ Bill: {} }));
vi.mock('@/lib/appSettings', () => ({ getAppSettings: async () => ({ currency: 'EUR' }) }));
vi.mock('@/app/expenses/actions', () => ({ addExpense: async () => ({ ok: true, id: 'exp1' }) }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

import { createBill, updateBill, setBillArchived, deleteBill, markBillPaid, markBillUnpaid } from './actions';

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

function billForm(fields: Record<string, string> = {}): FormData {
  const fd = new FormData();
  fd.set('title', 'Electricity');
  fd.set('amount', '42');
  fd.set('dueDate', '2026-08-01');
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  writes.clear();
  seeded.clear();
});

describe('bills actions — tenant routing', () => {
  it('createBill writes into the CURRENT tenant db, not the default one', async () => {
    await withTenant(acme, () => createBill(billForm()));

    expect(writes.get('acme')?.map((w) => w.op)).toEqual(['create']);
    expect(writes.get('acme')?.[0].doc.title).toBe('Electricity');
    expect(writes.get('default')).toBeUndefined();
    expect(writes.get('globex')).toBeUndefined();
  });

  it('keeps two tenants writing to their own db', async () => {
    await withTenant(acme, () => createBill(billForm({ title: 'Acme water' })));
    await withTenant(globex, () => createBill(billForm({ title: 'Globex water' })));

    expect(writes.get('acme')?.[0].doc.title).toBe('Acme water');
    expect(writes.get('globex')?.[0].doc.title).toBe('Globex water');
    expect(writes.get('acme')).toHaveLength(1);
    expect(writes.get('globex')).toHaveLength(1);
  });

  it('routes update / archive / soft-delete / unpay through the tenant model', async () => {
    await withTenant(acme, async () => {
      await updateBill('b1', billForm({ title: 'Updated' }));
      await setBillArchived('b1', true);
      await deleteBill('b1');
      await markBillUnpaid('b1');
    });

    expect(writes.get('acme')?.map((w) => w.op)).toEqual([
      'findByIdAndUpdate',
      'findByIdAndUpdate',
      'updateOne',
      'findByIdAndUpdate',
    ]);
    expect(writes.get('default')).toBeUndefined();
  });

  it('markBillPaid reads AND writes the same tenant db (including the recurring spawn)', async () => {
    seeded.set('acme', {
      _id: 'b1',
      title: 'Rent',
      vendor: 'Landlord',
      amount: 500,
      dueDate: new Date('2026-08-01'),
      cycle: 'monthly',
      category: 'housing',
      paidAt: null,
    });

    await withTenant(acme, () => markBillPaid('b1'));

    const ops = writes.get('acme')?.map((w) => w.op);
    // pay + spawn of the next month's instance, both in acme's db
    expect(ops).toEqual(['findByIdAndUpdate', 'create']);
    expect(writes.get('acme')?.[1].doc.title).toBe('Rent');
    expect(writes.get('default')).toBeUndefined();
  });

  it('still works with no tenant established (self-hosted default connection)', async () => {
    await createBill(billForm({ title: 'Self-hosted' }));

    expect(writes.get('default')?.[0].doc.title).toBe('Self-hosted');
    expect(writes.get('acme')).toBeUndefined();
  });
});
