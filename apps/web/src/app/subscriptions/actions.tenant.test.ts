import { describe, it, expect, vi, beforeEach } from 'vitest';
import { withTenant } from '@/lib/tenancy/current';
import type { TenantContext } from '@/lib/tenancy/context';

// Subscriptions CRUD used to import the Subscription (and Expense) models directly, so in SaaS
// mode every read and write went to the DEFAULT tenant db no matter who was logged in. The
// asymmetry was already visible inside the codebase: `lib/fxAudit.ts` and
// `settings/sampleDataActions.ts` reach the SAME model through `currentModel()`, so the FX audit
// panel was per-tenant while the /subscriptions page itself was not.
//
// These tests pin the fix at the action layer: each exported action must reach its collection
// through `currentModel()` inside `withRequestTenant`, so the row lands in (and comes back from)
// the CURRENT tenant's db.
//
// (Own file, like the bills/statements siblings: it mocks the tenancy seam tenant-AWARE, while
// actions.test.ts mocks it flat to pin the CRUD/discovery behaviour itself.)

type Write = { op: string; doc: Record<string, any> };
const writes = new Map<string, Write[]>();
// Per-tenant seed data, so a read that answers from the wrong db is directly observable.
const subsByTenant = new Map<string, Array<{ name?: string; provider?: string }>>();
const expensesByTenant = new Map<string, Array<Record<string, unknown>>>();

function log(tag: string, op: string, doc: Record<string, any>) {
  const list = writes.get(tag) ?? [];
  list.push({ op, doc });
  writes.set(tag, list);
}

function makeSubscriptionModel(tag: string) {
  return {
    __model: 'Subscription',
    create: async (doc: Record<string, any>) => {
      log(tag, 'create', doc);
      return doc;
    },
    findByIdAndUpdate: async (id: string, update: Record<string, any>) => {
      log(tag, 'findByIdAndUpdate', { id, ...update });
      return update;
    },
    updateOne: async (filter: Record<string, unknown>, update: Record<string, any>) => {
      log(tag, 'updateOne', { filter, update });
      return update;
    },
    find: () => ({
      select: () => ({ lean: async () => subsByTenant.get(tag) ?? [] }),
    }),
  };
}

function makeExpenseModel(tag: string) {
  return {
    __model: 'Expense',
    find: () => ({
      select: () => ({ lean: async () => expensesByTenant.get(tag) ?? [] }),
    }),
  };
}

// The seam is tagged BOTH by tenant and by model: `currentModel` is handed the real model object,
// so a wrong-model resolution (Expense read served from the Subscription collection) shows up as
// a wrong tag rather than silently passing.
vi.mock('@/lib/tenancy/connection', () => ({
  currentModel: async (model: { __kind?: string }) => {
    const { currentTenant } = await import('@/lib/tenancy/current');
    const ctx = currentTenant();
    const tag = ctx.isDefault || !ctx.tenantId ? 'default' : ctx.slug;
    return model.__kind === 'Expense' ? makeExpenseModel(tag) : makeSubscriptionModel(tag);
  },
}));
// The real wrapper resolves the tenant from request headers (none in a unit test), so run the
// body inside whatever tenant the test established with `withTenant`.
vi.mock('@/lib/tenancy/request', () => ({ withRequestTenant: async (fn: () => Promise<any>) => fn() }));
vi.mock('@/lib/db', () => ({ connectDB: async () => {} }));
vi.mock('@/models/Subscription', () => ({ Subscription: { __kind: 'Subscription' } }));
vi.mock('@/models/Expense', () => ({ Expense: { __kind: 'Expense' } }));
vi.mock('@/lib/appSettings', () => ({ getAppSettings: async () => ({ currency: 'EUR' }) }));
vi.mock('@/lib/auth', () => ({ assertCanWrite: async () => {} }));
vi.mock('@/lib/aiFeatures.server', () => ({ isFeatureEnabled: async () => true }));
vi.mock('@/lib/ollama', () => ({ suggestSubscription: async () => ({ parsed: {}, model: 'test' }) }));
// Pure algorithm with its own test file: echo what it was handed so the caller's wiring is what
// gets asserted here.
vi.mock('@/lib/recurringDiscovery', () => ({
  discoverRecurringCandidates: (expenses: Array<Record<string, unknown>>, opts: { excludeVendorKeys: Set<string> }) =>
    [{ vendor: String(expenses[0]?.vendor ?? 'none'), excluded: [...opts.excludeVendorKeys] }] as any,
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

import {
  createSubscription,
  updateSubscription,
  toggleSubscriptionActive,
  deleteSubscription,
  discoverUntrackedRecurring,
  trackDiscoveredSubscription,
} from './actions';

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

function subForm(fields: Record<string, string> = {}): FormData {
  const fd = new FormData();
  fd.set('name', 'Netflix');
  fd.set('amount', '15');
  fd.set('startDate', '2026-01-01');
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  writes.clear();
  subsByTenant.clear();
  expensesByTenant.clear();
});

describe('subscriptions actions — tenant routing', () => {
  it('createSubscription writes into the CURRENT tenant db, not the default one', async () => {
    await withTenant(acme, () => createSubscription(subForm()));

    expect(writes.get('acme')?.map((w) => w.op)).toEqual(['create']);
    expect(writes.get('acme')?.[0].doc.name).toBe('Netflix');
    expect(writes.get('default')).toBeUndefined();
    expect(writes.get('globex')).toBeUndefined();
  });

  it('keeps two tenants writing to their own db', async () => {
    await withTenant(acme, () => createSubscription(subForm({ name: 'Acme Spotify' })));
    await withTenant(globex, () => createSubscription(subForm({ name: 'Globex Spotify' })));

    expect(writes.get('acme')?.[0].doc.name).toBe('Acme Spotify');
    expect(writes.get('globex')?.[0].doc.name).toBe('Globex Spotify');
    expect(writes.get('acme')).toHaveLength(1);
    expect(writes.get('globex')).toHaveLength(1);
  });

  it('routes update / toggle / soft-delete through the tenant model', async () => {
    await withTenant(acme, async () => {
      await updateSubscription('s1', subForm({ name: 'Updated' }));
      await toggleSubscriptionActive('s1', false);
      await deleteSubscription('s1');
    });

    expect(writes.get('acme')?.map((w) => w.op)).toEqual([
      'findByIdAndUpdate',
      'findByIdAndUpdate',
      'updateOne',
    ]);
    expect(writes.get('default')).toBeUndefined();
  });

  it('trackDiscoveredSubscription ("Track this") lands in the current tenant db', async () => {
    await withTenant(globex, () =>
      trackDiscoveredSubscription({ vendor: 'OTE', amount: 30, cycle: 'monthly', firstDate: '2026-01-01' })
    );

    expect(writes.get('globex')?.map((w) => w.op)).toEqual(['create']);
    expect(writes.get('globex')?.[0].doc.name).toBe('OTE');
    expect(writes.get('default')).toBeUndefined();
  });

  it('discovery reads BOTH models from the same tenant (expenses and the exclude set)', async () => {
    expensesByTenant.set('acme', [{ vendor: 'Acme power', vendorKey: 'acmepower', amount: 10 }]);
    subsByTenant.set('acme', [{ name: 'Netflix', provider: '' }]);
    expensesByTenant.set('globex', [{ vendor: 'Globex power', vendorKey: 'globexpower', amount: 20 }]);
    subsByTenant.set('globex', [{ name: 'Spotify', provider: '' }]);

    const fromAcme: any = await withTenant(acme, () => discoverUntrackedRecurring());
    const fromGlobex: any = await withTenant(globex, () => discoverUntrackedRecurring());

    // Expenses came from the caller's db...
    expect(fromAcme[0].vendor).toBe('Acme power');
    expect(fromGlobex[0].vendor).toBe('Globex power');
    // ...and so did the subscriptions the exclude set is built from. A leak here would let one
    // tenant's tracked subscriptions suppress another tenant's discovery suggestions.
    expect(fromAcme[0].excluded).toEqual(['netflix']);
    expect(fromGlobex[0].excluded).toEqual(['spotify']);
  });

  it('still works with no tenant established (self-hosted default connection)', async () => {
    await createSubscription(subForm({ name: 'Self-hosted' }));

    expect(writes.get('default')?.[0].doc.name).toBe('Self-hosted');
    expect(writes.get('acme')).toBeUndefined();
  });
});
