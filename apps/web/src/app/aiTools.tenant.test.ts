import { describe, it, expect, vi, beforeEach } from 'vitest';
import { withTenant } from '@/lib/tenancy/current';
import type { TenantContext } from '@/lib/tenancy/context';

// aiTools' execute() imported eleven models directly, so in SaaS mode every tool the assistant
// can call — add a task, add a subscription, add to the shopping list, edit a record, soft-delete
// a record, read the whole financial overview — acted on the DEFAULT database instead of the
// caller's workspace. This is the routing half of the coverage (behaviour lives, flat, in
// aiTools.test.ts + aiTools.records.test.ts); it pins each tool to whatever tenant is ambient
// when execute() runs.
//
// execute() deliberately does not open the gate itself: its two entry points authenticate with
// different credentials (runAiCommand with the session cookie, /api/mcp with a bearer token) and
// establish the tenant before calling in. So these tests establish it with `withTenant`, exactly
// as those entry points do.
type Op = { model: string; op: string };
const ops = new Map<string, Op[]>();

function log(tag: string, model: string, op: string) {
  const list = ops.get(tag) ?? [];
  list.push({ model, op });
  ops.set(tag, list);
}
const opsOf = (tag: string) => (ops.get(tag) ?? []).map((o) => `${o.model}.${o.op}`);

function makeModel(tag: string, name: string) {
  const lean = async () => (name === 'Item' ? [] : []);
  const chain = (op: string) => {
    log(tag, name, op);
    return { select: () => ({ lean }), sort: () => ({ limit: () => ({ lean }) }), lean };
  };
  return {
    modelName: name,
    create: async (doc: Record<string, unknown>) => {
      log(tag, name, 'create');
      return { ...doc, _id: 'x1' };
    },
    updateOne: async () => {
      log(tag, name, 'updateOne');
      return { matchedCount: 1 };
    },
    countDocuments: async () => {
      log(tag, name, 'countDocuments');
      return 0;
    },
    find: () => chain('find'),
    findOne: () => chain('findOne'),
  };
}

vi.mock('@/lib/tenancy/connection', () => ({
  currentModel: async (m: { modelName: string }) => {
    const { currentTenant } = await import('@/lib/tenancy/current');
    const ctx = currentTenant();
    return makeModel(ctx.isDefault || !ctx.tenantId ? 'default' : ctx.slug, m.modelName);
  },
}));
vi.mock('@/lib/db', () => ({ connectDB: async () => {} }));
// Deliberately inert: every model here carries only its name. If a direct `Task.create(...)` ever
// comes back into aiTools, it throws right here instead of quietly writing to the wrong database.
vi.mock('@/models/Item', () => ({ Item: { modelName: 'Item' } }));
vi.mock('@/models/Task', () => ({ Task: { modelName: 'Task' } }));
vi.mock('@/models/Subscription', () => ({ Subscription: { modelName: 'Subscription' } }));
vi.mock('@/models/Expense', () => ({ Expense: { modelName: 'Expense' } }));
vi.mock('@/models/Receipt', () => ({ Receipt: { modelName: 'Receipt' } }));
vi.mock('@/models/Statement', () => ({ Statement: { modelName: 'Statement' } }));
vi.mock('@/models/Voucher', () => ({ Voucher: { modelName: 'Voucher' } }));
vi.mock('@/models/Bill', () => ({ Bill: { modelName: 'Bill' } }));
vi.mock('@/models/Goal', () => ({ Goal: { modelName: 'Goal' } }));
vi.mock('@/models/GiftCard', () => ({ GiftCard: { modelName: 'GiftCard' } }));
vi.mock('@/models/LoyaltyCard', () => ({ LoyaltyCard: { modelName: 'LoyaltyCard' } }));
vi.mock('@/models/ShoppingListItem', () => ({ ShoppingListItem: { modelName: 'ShoppingListItem' } }));
vi.mock('./expenses/actions', () => ({ addExpense: async () => ({ ok: true }) }));
vi.mock('./items/actions', () => ({ importItemFromUrl: async () => ({}), logItemPrice: async () => ({ ok: true }) }));
vi.mock('./search-actions', () => ({ searchAll: async () => [] }));
vi.mock('@/lib/ollama', () => ({ suggestSubscription: async () => ({ parsed: {} }) }));
vi.mock('@/lib/installments', () => ({ computeInstallmentPlans: () => [] }));
vi.mock('@/lib/appSettings', () => ({ getAppSettings: async () => ({ currency: 'EUR', budgets: {} }) }));
vi.mock('@/lib/money', () => ({ cur: () => '€', currencySymbol: () => '€' }));
vi.mock('@/lib/dates', () => ({ safeDate: (v: string) => new Date(v) }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

import { execute } from './aiTools';

const acme: TenantContext = {
  tenantId: '507f1f77bcf86cd799439011',
  slug: 'acme',
  dbName: 'tenant_acme',
  plan: 'shared',
  status: 'active',
  isDefault: false,
};
const globex: TenantContext = { ...acme, tenantId: '507f1f77bcf86cd799439012', slug: 'globex', dbName: 'tenant_globex' };
const ID = '507f1f77bcf86cd799439099';

beforeEach(() => ops.clear());

describe('aiTools execute() — every tool writes to the caller’s workspace', () => {
  it('add_task creates in the current tenant, not the default database', async () => {
    await withTenant(acme, () => execute('add_task', { title: 'Rack the switch' }));
    expect(opsOf('acme')).toEqual(['Task.create']);
    expect(opsOf('default')).toEqual([]);
  });

  it('add_subscription, add_to_list and add_item each land in the current tenant', async () => {
    await withTenant(acme, async () => {
      await execute('add_subscription', { provider: 'Netflix', amount: 15 });
      await execute('add_to_list', { name: 'milk' });
      await execute('add_item', { title: 'U7 Pro' });
    });
    expect(opsOf('acme')).toEqual(['Subscription.create', 'ShoppingListItem.create', 'Item.create']);
    expect(opsOf('default')).toEqual([]);
  });

  it('two workspaces calling the same tool never touch each other’s database', async () => {
    await withTenant(acme, () => execute('add_task', { title: 'a' }));
    await withTenant(globex, () => execute('add_task', { title: 'b' }));
    expect(opsOf('acme')).toEqual(['Task.create']);
    expect(opsOf('globex')).toEqual(['Task.create']);
  });

  it('get_overview reads ALL five collections from the current tenant (a single unscoped one would mix in another workspace’s money)', async () => {
    await withTenant(acme, () => execute('get_overview', {}));
    const seen = opsOf('acme');
    expect(seen).toContain('Item.countDocuments');
    expect(seen).toContain('Receipt.countDocuments');
    expect(seen).toContain('Subscription.find');
    expect(seen).toContain('Statement.find');
    expect(seen).toContain('Expense.find');
    expect(opsOf('default')).toEqual([]);
  });

  it('update_record edits the record in the current tenant', async () => {
    const r = await withTenant(acme, () => execute('update_record', { type: 'task', id: ID, fields: { status: 'done' } }));
    expect(r.summary).toBe('updated task');
    expect(opsOf('acme')).toEqual(['Task.updateOne']);
    expect(opsOf('default')).toEqual([]);
  });

  it('delete_record soft-deletes in the current tenant — the sharpest one, it removes a customer’s record', async () => {
    const r = await withTenant(acme, () => execute('delete_record', { type: 'item', id: ID }));
    expect(r.summary).toBe('deleted item');
    expect(opsOf('acme')).toEqual(['Item.updateOne']);
    expect(opsOf('default')).toEqual([]);
  });

  it('log_price looks the item up in the current tenant (a default-database lookup would find nothing, or the wrong item)', async () => {
    await withTenant(acme, () => execute('log_price', { query: 'switch', price: 100 }));
    expect(opsOf('acme')).toEqual(['Item.findOne']);
    expect(opsOf('default')).toEqual([]);
  });

  it('self-hosted parity: with no tenant established everything resolves to the default connection', async () => {
    await execute('add_task', { title: 'local' });
    expect(opsOf('default')).toEqual(['Task.create']);
  });
});
