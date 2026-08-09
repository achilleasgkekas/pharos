import { describe, it, expect, vi, beforeEach } from 'vitest';
import { withTenant } from '@/lib/tenancy/current';
import type { TenantContext } from '@/lib/tenancy/context';

// statements/cards.ts imported the Card model directly, so in SaaS mode every workspace created,
// renamed, deactivated and deleted payment cards in the DEFAULT database — while the sibling
// statement writers next door (statements/actions.ts) already went through `currentModel()`. These
// tests pin the four writers to the CURRENT tenant, and `scanCard` to running inside the gate at
// all: it touches no collection, but its AI call is metered against whatever tenant is current
// (lib/billing/aiMeter), so ungated a customer's scan was billed to nobody.
type Op = { model: string; op: string };
const ops = new Map<string, Op[]>();

function log(tag: string, model: string, op: string) {
  const list = ops.get(tag) ?? [];
  list.push({ model, op });
  ops.set(tag, list);
}
const opsOf = (tag: string) => (ops.get(tag) ?? []).map((o) => `${o.model}.${o.op}`);

function makeCardModel(tag: string) {
  return {
    modelName: 'Card',
    create: async (doc: Record<string, unknown>) => {
      log(tag, 'Card', 'create');
      return { ...doc, _id: 'c1' };
    },
    findByIdAndUpdate: async () => log(tag, 'Card', 'findByIdAndUpdate'),
    findByIdAndDelete: async () => log(tag, 'Card', 'findByIdAndDelete'),
  };
}

vi.mock('@/lib/tenancy/connection', () => ({
  currentModel: async (_m: { modelName: string }) => {
    const { currentTenant } = await import('@/lib/tenancy/current');
    const ctx = currentTenant();
    return makeCardModel(ctx.isDefault || !ctx.tenantId ? 'default' : ctx.slug);
  },
}));
// The real wrapper resolves the tenant from request headers (none in a unit test), so run the body
// inside whatever tenant the test established with `withTenant` — and record that it ran at all,
// which is the only observable for scanCard.
const gateCalls: string[] = [];
vi.mock('@/lib/tenancy/request', async () => ({
  withRequestTenant: async (fn: () => Promise<unknown>) => {
    const { currentTenant } = await import('@/lib/tenancy/current');
    const ctx = currentTenant();
    gateCalls.push(ctx.isDefault || !ctx.tenantId ? 'default' : ctx.slug);
    return fn();
  },
}));
vi.mock('@/lib/db', () => ({ connectDB: async () => {} }));
// Deliberately empty: if a direct `Card.create(...)` ever comes back, it throws here.
vi.mock('@/models/Card', () => ({ Card: { modelName: 'Card' } }));
vi.mock('@/lib/auth', () => ({ assertCanWrite: async () => {} }));
vi.mock('@/lib/aiFeatures.server', () => ({ isFeatureEnabled: async () => true }));
vi.mock('@/lib/ollama', () => ({
  parseCardImage: async () => ({ parsed: { name: 'Mastercard', last4: '7791' } }),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

import { createCard, updateCard, deleteCard, toggleCardActive, scanCard } from './cards';

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

function cardForm(fields: Record<string, string> = {}): FormData {
  const fd = new FormData();
  fd.set('name', 'Mastercard');
  fd.set('last4', '7791');
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  ops.clear();
  gateCalls.length = 0;
});

describe('statements cards — tenant routing', () => {
  it('createCard writes into the CURRENT tenant db, not the default one', async () => {
    await withTenant(acme, () => createCard(cardForm()));

    expect(opsOf('acme')).toEqual(['Card.create']);
    expect(ops.get('default')).toBeUndefined();
    expect(ops.get('globex')).toBeUndefined();
  });

  it('keeps two tenants writing to their own db', async () => {
    await withTenant(acme, () => createCard(cardForm()));
    await withTenant(globex, () => createCard(cardForm({ name: 'Visa' })));

    expect(opsOf('acme')).toEqual(['Card.create']);
    expect(opsOf('globex')).toEqual(['Card.create']);
  });

  it('routes update / delete / activation through the tenant model', async () => {
    await withTenant(acme, async () => {
      await updateCard('c1', cardForm());
      await toggleCardActive('c1', false);
      await deleteCard('c1');
    });

    expect(opsOf('acme')).toEqual(['Card.findByIdAndUpdate', 'Card.findByIdAndUpdate', 'Card.findByIdAndDelete']);
    expect(ops.get('default')).toBeUndefined();
  });

  it('deleteCard cannot reach another workspace: the delete lands in the caller tenant', async () => {
    await withTenant(globex, () => deleteCard('c1'));

    expect(opsOf('globex')).toEqual(['Card.findByIdAndDelete']);
    expect(ops.get('acme')).toBeUndefined();
    expect(ops.get('default')).toBeUndefined();
  });

  it('scanCard runs inside the tenant gate, so its AI call meters against that tenant', async () => {
    const res = await withTenant(acme, () => scanCard(new FormData()));

    // No file in the form, so it returns early — the point is that the early return happened
    // INSIDE the gate, which is where quota and the workspace AI switches are read.
    expect(res).toEqual({ ok: false, error: 'No image' });
    expect(gateCalls).toEqual(['acme']);
  });

  it('self-hosted keeps working: the default tenant still writes its own db', async () => {
    await createCard(cardForm());

    expect(opsOf('default')).toEqual(['Card.create']);
  });
});
