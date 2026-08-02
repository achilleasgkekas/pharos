import { describe, it, expect, vi, beforeEach } from 'vitest';
import { withTenant } from '@/lib/tenancy/current';
import type { TenantContext } from '@/lib/tenancy/context';

// The /tasks kanban imported the Task model directly, so in SaaS mode every create/edit/step
// landed in the DEFAULT tenant db no matter who was logged in. The asymmetry was already inside
// the codebase: `items/actions.ts` ("convert to task") reaches the SAME model through
// `currentModel()`, so a task born from an item went to the right db while a task typed straight
// into /tasks did not.
//
// These tests pin the fix at the action layer: each exported action must reach its collection
// through `currentModel()` inside `withRequestTenant`, so the row lands in the CURRENT tenant's db.
//
// (Own file, like the subscriptions/bills/statements siblings: it mocks the tenancy seam
// tenant-AWARE, while actions.test.ts mocks it flat to pin the CRUD/step behaviour itself.)

type Write = { op: string; doc: Record<string, any> };
const writes = new Map<string, Write[]>();

function log(tag: string, op: string, doc: Record<string, any>) {
  const list = writes.get(tag) ?? [];
  list.push({ op, doc });
  writes.set(tag, list);
}

function makeTaskModel(tag: string) {
  return {
    __model: 'Task',
    create: async (doc: Record<string, any>) => {
      log(tag, 'create', doc);
      // The id is tagged too, so a create answered by the wrong db is visible in the return value.
      return { _id: `${tag}-task1` };
    },
    findByIdAndUpdate: async (id: string, update: Record<string, any>) => {
      log(tag, 'findByIdAndUpdate', { id, ...update });
      return update;
    },
    updateOne: async (filter: Record<string, unknown>, update: Record<string, any>) => {
      log(tag, 'updateOne', { filter, update });
      return update;
    },
  };
}

// The seam is tagged by tenant: `currentModel` is handed the real model object, so a resolution
// that ignores the ambient tenant shows up as a wrong tag rather than silently passing.
vi.mock('@/lib/tenancy/connection', () => ({
  currentModel: async (_model: unknown) => {
    const { currentTenant } = await import('@/lib/tenancy/current');
    const ctx = currentTenant();
    return makeTaskModel(ctx.isDefault || !ctx.tenantId ? 'default' : ctx.slug);
  },
}));
// The real wrapper resolves the tenant from request headers (none in a unit test), so run the
// body inside whatever tenant the test established with `withTenant`.
vi.mock('@/lib/tenancy/request', () => ({ withRequestTenant: async (fn: () => Promise<any>) => fn() }));
vi.mock('@/lib/db', () => ({ connectDB: async () => {} }));
vi.mock('@/models/Task', () => ({ Task: { __kind: 'Task' } }));
vi.mock('@/lib/auth', () => ({ assertCanWrite: async () => {} }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

import {
  createTask,
  updateTaskStatus,
  deleteTask,
  updateTaskDetails,
  addStep,
  toggleStep,
  deleteStep,
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

function taskForm(fields: Record<string, string> = {}): FormData {
  const fd = new FormData();
  fd.set('title', 'Rack the switch');
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  writes.clear();
});

describe('tasks actions — tenant routing', () => {
  it('createTask writes into the CURRENT tenant db, not the default one', async () => {
    const id = await withTenant(acme, () => createTask(taskForm()));

    expect(writes.get('acme')?.map((w) => w.op)).toEqual(['create']);
    expect(writes.get('acme')?.[0].doc.title).toBe('Rack the switch');
    // The returned id came from acme's collection, not from a default-db write.
    expect(id).toBe('acme-task1');
    expect(writes.get('default')).toBeUndefined();
    expect(writes.get('globex')).toBeUndefined();
  });

  it('two tenants creating tasks never see each other writes', async () => {
    await withTenant(acme, () => createTask(taskForm({ title: 'Acme task' })));
    await withTenant(globex, () => createTask(taskForm({ title: 'Globex task' })));

    expect(writes.get('acme')?.map((w) => w.doc.title)).toEqual(['Acme task']);
    expect(writes.get('globex')?.map((w) => w.doc.title)).toEqual(['Globex task']);
    expect(writes.get('default')).toBeUndefined();
  });

  it('updateTaskStatus and updateTaskDetails edit inside the current tenant', async () => {
    await withTenant(acme, () => updateTaskStatus('t1', 'done'));
    await withTenant(globex, () => updateTaskDetails('t2', taskForm({ title: 'Globex edit' })));

    expect(writes.get('acme')?.map((w) => w.op)).toEqual(['findByIdAndUpdate']);
    expect(writes.get('acme')?.[0].doc.id).toBe('t1');
    expect(writes.get('acme')?.[0].doc.status).toBe('done');
    expect(writes.get('globex')?.[0].doc.title).toBe('Globex edit');
    expect(writes.get('default')).toBeUndefined();
  });

  it('deleteTask soft-deletes inside the current tenant', async () => {
    await withTenant(globex, () => deleteTask('t9'));

    expect(writes.get('globex')?.map((w) => w.op)).toEqual(['updateOne']);
    expect(writes.get('globex')?.[0].doc.filter).toEqual({ _id: 't9' });
    expect(writes.get('globex')?.[0].doc.update.$set.deletedAt).toBeInstanceOf(Date);
    expect(writes.get('default')).toBeUndefined();
  });

  it('step CRUD (add/toggle/delete) stays inside the current tenant', async () => {
    await withTenant(acme, async () => {
      await addStep('t1', 'Mount the rails');
      await toggleStep('t1', 's1', true);
      await deleteStep('t1', 's1');
    });

    expect(writes.get('acme')?.map((w) => w.op)).toEqual([
      'findByIdAndUpdate',
      'updateOne',
      'findByIdAndUpdate',
    ]);
    expect(writes.get('acme')?.[0].doc.$push.steps.text).toBe('Mount the rails');
    expect(writes.get('default')).toBeUndefined();
    expect(writes.get('globex')).toBeUndefined();
  });

  it('a blank addStep short-circuits before touching any db', async () => {
    await withTenant(acme, () => addStep('t1', '   '));

    expect(writes.size).toBe(0);
  });

  it('self-hosted (no tenant established) still resolves to the default db', async () => {
    await createTask(taskForm({ title: 'Self-hosted task' }));

    expect(writes.get('default')?.map((w) => w.doc.title)).toEqual(['Self-hosted task']);
    expect(writes.get('acme')).toBeUndefined();
  });
});
