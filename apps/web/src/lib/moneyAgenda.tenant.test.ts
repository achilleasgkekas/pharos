import { describe, it, expect, beforeEach, vi } from 'vitest';
import { withTenant } from '@/lib/tenancy/current';
import type { TenantContext } from '@/lib/tenancy/context';

// `computeMoneyAgenda` is the shared three-month money view behind FOUR entrypoints: the
// /reports page, GET /api/v1/reports, GET /api/v1/calendar and the .ics feed. Three of them
// establish a tenant before calling it, yet every read used the imported model, so a SaaS
// workspace opening /reports was shown the DEFAULT database's subscriptions, statements,
// warranties, vouchers and recurring expenses — with amounts and vendor names on them.
// This file pins the property that matters: the five collections are read from the CALLING
// workspace, and the rows that come back belong to it.
const ops = new Map<string, string[]>();
const modelsOf = (tag: string) => (ops.get(tag) ?? []).slice().sort();

/** Rows a model hands back, tagged with the tenant they were resolved for — so a leak shows
 *  up as somebody else's name inside the agenda, not just as a wrong call count. */
function rowsFor(tag: string, modelName: string): unknown[] {
  if (modelName !== 'Subscription') return [];
  return [{ _id: `${tag}-sub`, name: `${tag} Netflix`, amount: 10, billingCycle: 'monthly', nextRenewal: new Date(2026, 0, 20) }];
}

/** A model whose `find` records which tenant it was resolved for. The chain answers to every
 *  shape the five call sites use (`select`, `sort`, `lean`). */
function makeModel(tag: string, modelName: string) {
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.sort = () => chain;
  chain.lean = async () => rowsFor(tag, modelName);
  return {
    modelName,
    find: () => {
      ops.set(tag, [...(ops.get(tag) ?? []), modelName]);
      return chain;
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
vi.mock('@/lib/db', () => ({ connectDB: async () => {} }));

// Deliberately name-only: a direct `Subscription.find(...)` that skipped `currentModel` would
// throw here instead of quietly reading the default database.
vi.mock('@/models/Subscription', () => ({ Subscription: { modelName: 'Subscription' } }));
vi.mock('@/models/Statement', () => ({ Statement: { modelName: 'Statement' } }));
vi.mock('@/models/Item', () => ({ Item: { modelName: 'Item' } }));
vi.mock('@/models/Voucher', () => ({ Voucher: { modelName: 'Voucher' } }));
vi.mock('@/models/Expense', () => ({ Expense: { modelName: 'Expense' } }));

import { computeMoneyAgenda } from './moneyAgenda';

const ALL_FIVE = ['Expense', 'Item', 'Statement', 'Subscription', 'Voucher'];
const NOW = new Date(2026, 0, 15);

function ctx(slug: string): TenantContext {
  return { tenantId: `id-${slug}`, slug, isDefault: false } as TenantContext;
}

describe('computeMoneyAgenda reads the CURRENT workspace only', () => {
  beforeEach(() => ops.clear());

  it('resolves all five collections from the calling workspace', async () => {
    await withTenant(ctx('acme'), () => computeMoneyAgenda(NOW));
    expect(modelsOf('acme')).toEqual(ALL_FIVE);
    expect(modelsOf('default')).toEqual([]);
    expect(modelsOf('globex')).toEqual([]);
  });

  it('THE ONE THAT MATTERS — a second workspace never touches the first', async () => {
    await withTenant(ctx('acme'), () => computeMoneyAgenda(NOW));
    ops.clear();
    await withTenant(ctx('globex'), () => computeMoneyAgenda(NOW));
    expect(modelsOf('globex')).toEqual(ALL_FIVE);
    expect(modelsOf('acme')).toEqual([]);
    expect(modelsOf('default')).toEqual([]);
  });

  it('the agenda entries are the caller\'s rows, not the default tenant\'s', async () => {
    const { months } = await withTenant(ctx('acme'), () => computeMoneyAgenda(NOW));
    const labels = months.flatMap((m) => m.entries.map((e) => e.label));
    expect(labels.some((l) => l.includes('acme Netflix'))).toBe(true);
    expect(labels.some((l) => l.includes('default'))).toBe(false);
  });

  it('self-hosted parity: with no tenant established everything runs on the default', async () => {
    await computeMoneyAgenda(NOW);
    expect(modelsOf('default')).toEqual(ALL_FIVE);
  });
});
