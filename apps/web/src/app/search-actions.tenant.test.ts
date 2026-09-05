import { describe, it, expect, beforeEach, vi } from 'vitest';
import { withTenant } from '@/lib/tenancy/current';
import type { TenantContext } from '@/lib/tenancy/context';

// The global search is the widest read surface in the app: twelve collections behind two
// letters typed in the navbar, and the same function behind the assistant's `search_data`
// tool and GET /api/v1/search. Every query used the imported model, so in SaaS mode every
// workspace searched the DEFAULT database — receipts, statements, bills and gift cards of
// whoever happened to live there, with working deep links. This file pins the property that
// matters: the twelve finds run against the CALLER'S workspace and nothing else.
type Op = { model: string };
const ops = new Map<string, Op[]>();

function log(tag: string, model: string) {
  const list = ops.get(tag) ?? [];
  list.push({ model });
  ops.set(tag, list);
}
const modelsOf = (tag: string) => (ops.get(tag) ?? []).map((o) => o.model).sort();

/** A model whose `find` records which tenant it was resolved for, then returns one row. */
function makeModel(tag: string, modelName: string) {
  return {
    modelName,
    find: () => {
      log(tag, modelName);
      return {
        limit: () => ({
          select: () => ({
            lean: async () => [{ _id: `${tag}-${modelName}`, title: `${tag} ${modelName}`, store: tag, card: tag, name: `${tag} ${modelName}`, period: 'x', date: new Date(0), status: 'owned' }],
          }),
        }),
      };
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
// The real wrapper resolves the tenant from request headers (none in a unit test), so run the
// body inside whatever tenant the test established with `withTenant`.
vi.mock('@/lib/tenancy/request', () => ({
  withRequestTenant: async (fn: () => Promise<unknown>) => fn(),
}));
vi.mock('@/lib/db', () => ({ connectDB: async () => {} }));
vi.mock('@/lib/appSettings', () => ({ getAppSettings: async () => ({ currency: 'EUR' }) }));

// Deliberately name-only: a direct `Item.find(...)` that skipped `currentModel` would throw
// here instead of quietly reading the default database.
vi.mock('@/models/Item', () => ({ Item: { modelName: 'Item' } }));
vi.mock('@/models/Receipt', () => ({ Receipt: { modelName: 'Receipt' } }));
vi.mock('@/models/Statement', () => ({ Statement: { modelName: 'Statement' } }));
vi.mock('@/models/Task', () => ({ Task: { modelName: 'Task' } }));
vi.mock('@/models/Subscription', () => ({ Subscription: { modelName: 'Subscription' } }));
vi.mock('@/models/Expense', () => ({ Expense: { modelName: 'Expense' } }));
vi.mock('@/models/Voucher', () => ({ Voucher: { modelName: 'Voucher' } }));
vi.mock('@/models/Bill', () => ({ Bill: { modelName: 'Bill' } }));
vi.mock('@/models/Goal', () => ({ Goal: { modelName: 'Goal' } }));
vi.mock('@/models/GiftCard', () => ({ GiftCard: { modelName: 'GiftCard' } }));
vi.mock('@/models/LoyaltyCard', () => ({ LoyaltyCard: { modelName: 'LoyaltyCard' } }));
vi.mock('@/models/ShoppingListItem', () => ({ ShoppingListItem: { modelName: 'ShoppingListItem' } }));

import { searchAll } from './search-actions';

const ALL_TWELVE = [
  'Bill', 'Expense', 'GiftCard', 'Goal', 'Item', 'LoyaltyCard', 'Receipt',
  'ShoppingListItem', 'Statement', 'Subscription', 'Task', 'Voucher',
].sort();

function ctx(slug: string): TenantContext {
  return { tenantId: `id-${slug}`, slug, isDefault: false } as TenantContext;
}

describe('searchAll searches the CURRENT workspace only', () => {
  beforeEach(() => ops.clear());

  it('resolves all twelve collections from the calling workspace', async () => {
    await withTenant(ctx('acme'), () => searchAll('laptop'));
    expect(modelsOf('acme')).toEqual(ALL_TWELVE);
    expect(modelsOf('default')).toEqual([]);
    expect(modelsOf('globex')).toEqual([]);
  });

  it('THE ONE THAT MATTERS — a second workspace never touches the first', async () => {
    await withTenant(ctx('acme'), () => searchAll('laptop'));
    ops.clear();
    await withTenant(ctx('globex'), () => searchAll('laptop'));
    expect(modelsOf('globex')).toEqual(ALL_TWELVE);
    expect(modelsOf('acme')).toEqual([]);
    expect(modelsOf('default')).toEqual([]);
  });

  it('returns the calling workspace rows, not the default ones', async () => {
    const hits = await withTenant(ctx('acme'), () => searchAll('laptop'));
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((h) => JSON.stringify(h).includes('acme'))).toBe(true);
  });

  it('self-hosted parity: with no tenant established everything runs on the default', async () => {
    await searchAll('laptop');
    expect(modelsOf('default')).toEqual(ALL_TWELVE);
  });

  it('the min-length guard still short-circuits before any collection is touched', async () => {
    expect(await withTenant(ctx('acme'), () => searchAll(' a '))).toEqual([]);
    expect(modelsOf('acme')).toEqual([]);
  });
});
