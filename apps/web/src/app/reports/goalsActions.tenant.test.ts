import { describe, it, expect, beforeEach, vi } from 'vitest';
import { withTenant } from '@/lib/tenancy/current';
import type { TenantContext } from '@/lib/tenancy/context';

// goalsActions.ts imported the Goal model directly, so in SaaS mode every savings goal — and
// every contribution logged against it — landed in the DEFAULT database no matter who was signed
// in. One workspace's financial goals would show up in, and be editable from, every other
// workspace. Same class as the money modules already closed; this file pins the fix.
//
// The seam is TAGGED by tenant: `currentModel` is handed the real model object and returns a
// per-tenant fake, so an action that ignores the ambient tenant shows up as a write against the
// wrong tag instead of silently passing.
//
// (Sibling convention: goalsActions.test.ts mocks the same seam FLAT to pin CRUD behaviour.)

type Write = { op: string; doc: Record<string, any> };
const writes = new Map<string, Write[]>();

function log(tag: string, op: string, doc: Record<string, any>) {
  const list = writes.get(tag) ?? [];
  list.push({ op, doc });
  writes.set(tag, list);
}

function makeGoalModel(tag: string) {
  return {
    __model: 'Goal',
    create: async (doc: Record<string, any>) => {
      log(tag, 'create', doc);
      return { _id: `${tag}-goal1` };
    },
    findByIdAndUpdate: async (id: string, update: Record<string, any>) => {
      log(tag, 'findByIdAndUpdate', { id, update });
      return {};
    },
    updateOne: async (filter: Record<string, unknown>, update: Record<string, any>) => {
      log(tag, 'updateOne', { filter, update });
      return { matchedCount: 1 };
    },
    // P83's already-swept guard. Always "not found" here: what the test cares about is
    // WHICH database was asked, not the answer.
    exists: async (filter: Record<string, unknown>) => {
      log(tag, 'exists', { filter });
      return null;
    },
  };
}

vi.mock('@/lib/tenancy/connection', () => ({
  currentModel: async (_model: unknown) => {
    const { currentTenant } = await import('@/lib/tenancy/current');
    const ctx = currentTenant();
    return makeGoalModel(ctx.isDefault || !ctx.tenantId ? 'default' : ctx.slug);
  },
}));
// The real wrapper resolves the tenant from request headers (none in a unit test), so run the
// body inside whatever tenant the test established with `withTenant`.
vi.mock('@/lib/tenancy/request', () => ({ withRequestTenant: async (fn: () => Promise<any>) => fn() }));
vi.mock('@/lib/db', () => ({ connectDB: async () => {} }));
vi.mock('@/models/Goal', () => ({ Goal: { __kind: 'Goal' } }));
vi.mock('@/lib/auth', () => ({ assertCanWrite: async () => {} }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

import {
  createGoal,
  updateGoal,
  setGoalArchived,
  deleteGoal,
  addGoalContribution,
  removeGoalContribution,
  sweepBudgetLeftoverToGoal,
} from './goalsActions';

const acme: TenantContext = {
  tenantId: '507f1f77bcf86cd799439011',
  slug: 'acme',
  dbName: 'tenant_acme',
  plan: 'shared',
  status: 'active',
  isDefault: false,
};
const globex: TenantContext = { ...acme, tenantId: '507f1f77bcf86cd799439022', slug: 'globex', dbName: 'tenant_globex' };

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

const opsFor = (tag: string) => (writes.get(tag) ?? []).map((w) => w.op);

beforeEach(() => writes.clear());

describe('every goals action writes to the CURRENT tenant database', () => {
  it('createGoal lands in the caller workspace, not the default one', async () => {
    await withTenant(acme, () => createGoal(form({ title: 'New roof', targetAmount: '5000' })));

    expect(opsFor('acme')).toEqual(['create']);
    expect(writes.get('default')).toBeUndefined();
    expect(writes.get('acme')![0].doc).toMatchObject({ title: 'New roof', targetAmount: 5000 });
  });

  it.each([
    ['updateGoal', () => updateGoal('g1', form({ title: 'Renamed' })), 'findByIdAndUpdate'],
    ['setGoalArchived', () => setGoalArchived('g1', true), 'findByIdAndUpdate'],
    ['deleteGoal', () => deleteGoal('g1'), 'updateOne'],
    ['addGoalContribution', () => addGoalContribution('g1', 250), 'findByIdAndUpdate'],
    ['removeGoalContribution', () => removeGoalContribution('g1', 'c1'), 'findByIdAndUpdate'],
  ])('%s writes to the current tenant', async (_name, run, op) => {
    await withTenant(acme, run);

    expect(opsFor('acme')).toEqual([op]);
    expect(writes.get('default')).toBeUndefined();
  });

  it('two workspaces never touch each other, even back to back in one process', async () => {
    // The failure this guards against is ambient state leaking between requests: goal one lands
    // correctly and goal two follows it into the same database.
    await withTenant(acme, () => createGoal(form({ title: 'Acme goal' })));
    await withTenant(globex, () => createGoal(form({ title: 'Globex goal' })));

    expect(writes.get('acme')!.map((w) => w.doc.title)).toEqual(['Acme goal']);
    expect(writes.get('globex')!.map((w) => w.doc.title)).toEqual(['Globex goal']);
  });

  it('a soft delete is scoped too — it must not tombstone another workspace’s goal', async () => {
    await withTenant(globex, () => deleteGoal('g1'));

    const [w] = writes.get('globex')!;
    expect(w.op).toBe('updateOne');
    expect(w.doc.update.$set.deletedAt).toBeInstanceOf(Date);
    expect(writes.get('acme')).toBeUndefined();
  });

  it('SELF-HOSTED PARITY: with no tenant established everything still goes to the default model', async () => {
    await createGoal(form({ title: 'Self-hosted goal' }));

    expect(opsFor('default')).toEqual(['create']);
    expect(writes.get('acme')).toBeUndefined();
  });

  it('a budget sweep asks the CALLER workspace whether the month was already swept', async () => {
    // The guard is a read against the goals collection. Run in the default database it
    // would both miss this workspace's own sweep and leak that another workspace swept
    // that category — so the lookup and the write must land on the same tenant.
    await withTenant(acme, () => sweepBudgetLeftoverToGoal('g1', 'groceries', '2026-08', 60));
    expect(opsFor('acme')).toEqual(['exists', 'findByIdAndUpdate']);
    expect(opsFor('default')).toEqual([]);
    expect(opsFor('globex')).toEqual([]);
  });

  it('a rejected contribution touches no database at all', async () => {
    // The validation guard must run before the model is resolved, so a bad amount cannot even
    // reach the wrong database.
    const res = await withTenant(acme, () => addGoalContribution('g1', -5));

    expect(res.ok).toBe(false);
    expect(writes.size).toBe(0);
  });
});
