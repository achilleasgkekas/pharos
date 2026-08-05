import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TenantContext } from '@/lib/tenancy/context';

// The notification bell used to import all 7 of its models directly, so in SaaS mode it
// scanned the DEFAULT tenant's items/bills/subscriptions and wrote every alert into the
// DEFAULT tenant's Notification collection, no matter who was logged in. That is a bigger
// blast radius than the earlier money-module fixes: one function reads SIX collections.
//
// This file pins the fix at the action layer with a per-tenant fake model set. Every read
// and write is tagged with BOTH the tenant and the model it hit, so a leak shows up as an
// op recorded under 'default' instead of 'acme'. Sibling files mock the tenancy seam flat
// (./actions.test.ts, ./actions.reconcile.test.ts) to pin the behaviour itself.

type Op = { model: string; op: string; arg?: unknown };
const ops = new Map<string, Op[]>();
// Rows each tagged db answers with, keyed `<tenantTag>:<Model>`.
const rows = new Map<string, unknown[]>();

function log(tag: string, model: string, op: string, arg?: unknown) {
  const list = ops.get(tag) ?? [];
  list.push({ model, op, arg });
  ops.set(tag, list);
}

function opsFor(tag: string, model: string): string[] {
  return (ops.get(tag) ?? []).filter((o) => o.model === model).map((o) => o.op);
}

function makeModel(tag: string, model: string) {
  const query: Record<string, unknown> = {};
  for (const m of ['select', 'sort', 'limit', 'setOptions']) query[m] = () => query;
  query.lean = async () => rows.get(`${tag}:${model}`) ?? [];
  return {
    find: (filter?: unknown) => {
      log(tag, model, 'find', filter);
      return query;
    },
    insertMany: async (docs: unknown[]) => {
      log(tag, model, 'insertMany', docs);
      return docs;
    },
    updateOne: async (filter: unknown) => {
      log(tag, model, 'updateOne', filter);
      return {};
    },
    updateMany: async (filter: unknown) => {
      log(tag, model, 'updateMany', filter);
      return {};
    },
    countDocuments: async () => {
      log(tag, model, 'countDocuments');
      return 0;
    },
  };
}

vi.mock('@/lib/tenancy/connection', () => ({
  currentModel: async (m: { modelName: string }) => {
    const { currentTenant } = await import('@/lib/tenancy/current');
    const ctx = currentTenant();
    return makeModel(ctx.isDefault || !ctx.tenantId ? 'default' : ctx.slug, m.modelName);
  },
}));
// The real wrapper resolves the tenant from request headers (none in a unit test), so run
// the body inside whatever tenant the test established with `withTenant`. getNotifications'
// non-denying seam (resolveRequestTenantOrNull) mirrors that: hand back whatever tenant is
// CURRENTLY ambient (set by the test's own outer `withTenant(acme, ...)`), so getNotifications'
// internal re-wrap is a no-op re-affirmation rather than clobbering it with something else.
vi.mock('@/lib/tenancy/request', () => ({
  withRequestTenant: async (fn: () => Promise<any>) => fn(),
  resolveRequestTenantOrNull: async () => {
    const { currentTenant } = await import('@/lib/tenancy/current');
    return currentTenant();
  },
}));
vi.mock('@/lib/db', () => ({ connectDB: async () => {} }));
vi.mock('@/lib/auth', () => ({ assertCanWrite: async () => {} }));
vi.mock('@/models/Item', () => ({ Item: { modelName: 'Item' } }));
vi.mock('@/models/Statement', () => ({ Statement: { modelName: 'Statement' } }));
vi.mock('@/models/Expense', () => ({ Expense: { modelName: 'Expense' } }));
vi.mock('@/models/Subscription', () => ({ Subscription: { modelName: 'Subscription' } }));
vi.mock('@/models/GiftCard', () => ({ GiftCard: { modelName: 'GiftCard' } }));
vi.mock('@/models/Bill', () => ({ Bill: { modelName: 'Bill' } }));
vi.mock('@/models/Notification', () => ({ Notification: { modelName: 'Notification' } }));
vi.mock('@/lib/appSettings', () => ({
  getAppSettings: async () => ({ warrantyAlertDays: 90, trialAlertDays: 2, giftCardAlertDays: 30, billAlertDays: 5 }),
}));

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

/** One deal-triggering item, so the reconcile has something real to insert. */
function seedDeal(tag: string, title: string) {
  rows.set(`${tag}:Item`, [{ _id: 'i1', title, targetPrice: 100, currentPrice: 80, links: [] }]);
}

/** `lastGen` is module-level, so every test starts from a fresh module instance.
 *  `withTenant` comes from the SAME fresh graph on purpose: after `vi.resetModules()` the
 *  AsyncLocalStorage in `@/lib/tenancy/current` is a new instance, and a `withTenant` bound
 *  to the previous one would set a store the actions can no longer read (everything would
 *  silently fall back to the default tenant, i.e. the very bug under test would look fine). */
async function freshModule() {
  vi.resetModules();
  const [actions, current] = await Promise.all([import('./actions'), import('@/lib/tenancy/current')]);
  return { ...actions, withTenant: current.withTenant };
}

beforeEach(() => {
  ops.clear();
  rows.clear();
});

describe('notifications actions — tenant routing', () => {
  it('generateNotifications scans all six source models in the CURRENT tenant db', async () => {
    const { generateNotifications, withTenant } = await freshModule();
    seedDeal('acme', 'Acme monitor');

    await withTenant(acme, () => generateNotifications());

    // Every model computeAlerts touches was resolved against acme, none against default.
    for (const m of ['Item', 'Statement', 'Expense', 'Subscription', 'GiftCard', 'Bill']) {
      expect(opsFor('acme', m)).toContain('find');
    }
    expect(ops.get('default')).toBeUndefined();
    expect(ops.get('globex')).toBeUndefined();
  });

  it('writes the reconciled notifications into the same tenant db it scanned', async () => {
    const { generateNotifications, withTenant } = await freshModule();
    seedDeal('acme', 'Acme monitor');

    await withTenant(acme, () => generateNotifications());

    const inserted = (ops.get('acme') ?? []).find((o) => o.model === 'Notification' && o.op === 'insertMany');
    expect((inserted?.arg as Array<{ title: string; kind: string }>)?.[0]).toMatchObject({ kind: 'deal', title: 'Acme monitor' });
    // …and the auto-expire sweep stayed in acme too.
    expect(opsFor('acme', 'Notification')).toContain('updateMany');
    expect(ops.get('default')).toBeUndefined();
  });

  it('keeps two tenants on their own alerts', async () => {
    const { generateNotifications, withTenant } = await freshModule();
    seedDeal('acme', 'Acme monitor');
    seedDeal('globex', 'Globex monitor');

    await withTenant(acme, () => generateNotifications());
    await withTenant(globex, () => generateNotifications());

    const titleOf = (tag: string) => {
      const op = (ops.get(tag) ?? []).find((o) => o.model === 'Notification' && o.op === 'insertMany');
      return (op?.arg as Array<{ title: string }>)?.[0]?.title;
    };
    expect(titleOf('acme')).toBe('Acme monitor');
    expect(titleOf('globex')).toBe('Globex monitor');
    expect(ops.get('default')).toBeUndefined();
  });

  it('getNotifications reads the current tenant db', async () => {
    const { getNotifications, withTenant } = await freshModule();
    rows.set('acme:Notification', [
      { _id: 'n1', kind: 'deal', title: 'Acme deal', body: '80|100', href: '/shopping', read: false, createdAt: new Date() },
    ]);

    const res = await withTenant(acme, () => getNotifications());

    expect(res.items.map((i) => i.title)).toEqual(['Acme deal']);
    expect(opsFor('acme', 'Notification')).toContain('countDocuments');
    expect(ops.get('default')).toBeUndefined();
  });

  it('throttles generation PER TENANT — one workspace poll does not silence another', async () => {
    const { getNotifications, withTenant } = await freshModule();

    // acme polls twice: the second is inside the 10-minute window, so no rescan.
    await withTenant(acme, () => getNotifications());
    const acmeScansAfterFirst = opsFor('acme', 'Item').length;
    await withTenant(acme, () => getNotifications());
    expect(opsFor('acme', 'Item')).toHaveLength(acmeScansAfterFirst);

    // globex has its own window, so its very first poll must still reconcile.
    await withTenant(globex, () => getNotifications());
    expect(opsFor('globex', 'Item').length).toBeGreaterThan(0);
  });

  it('routes the four bell mutations through the tenant model', async () => {
    const { markNotificationRead, markAllNotificationsRead, dismissNotification, clearAllNotifications, withTenant } = await freshModule();

    await withTenant(acme, async () => {
      await markNotificationRead('n1');
      await markAllNotificationsRead();
      await dismissNotification('n1');
      await clearAllNotifications();
    });

    expect(opsFor('acme', 'Notification')).toEqual(['updateOne', 'updateMany', 'updateOne', 'updateMany']);
    expect(ops.get('default')).toBeUndefined();
  });

  it('still works with no tenant established (self-hosted default connection)', async () => {
    const { generateNotifications, withTenant } = await freshModule();
    seedDeal('default', 'Self-hosted monitor');

    await generateNotifications();

    const inserted = (ops.get('default') ?? []).find((o) => o.model === 'Notification' && o.op === 'insertMany');
    expect((inserted?.arg as Array<{ title: string }>)?.[0]?.title).toBe('Self-hosted monitor');
    expect(ops.get('acme')).toBeUndefined();
  });
});
