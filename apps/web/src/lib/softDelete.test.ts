import { describe, it, expect, vi } from 'vitest';
import { Schema } from 'mongoose';
import type { Query } from 'mongoose';
import { hideDeleted, softDeletePlugin, SOFT_DELETE_HOOKS } from './softDelete';

// The soft-delete plugin is the data-safety layer behind the Trash: it hides trashed
// docs (deletedAt != null) from every find/count/distinct and from bulk update/delete,
// so no page or report has to remember the filter. A regression here would either leak
// trashed records into normal views or, worse, let a merge/cleanup rewrite them. These
// tests lock the two things that matter: the hook narrows the query unless the caller
// opted into `withDeleted`, and it is registered on every guarded hook.

/** Build a minimal Query-like `this` for the pre-hook, capturing where() calls. */
function fakeQuery(options: Record<string, unknown>) {
  const where = vi.fn();
  const self = { getOptions: () => options, where } as unknown as Query<unknown, unknown>;
  return { self, where };
}

describe('hideDeleted', () => {
  it('narrows to non-trashed docs when withDeleted is absent', () => {
    const { self, where } = fakeQuery({});
    hideDeleted.call(self);
    expect(where).toHaveBeenCalledTimes(1);
    expect(where).toHaveBeenCalledWith({ deletedAt: null });
  });

  it('narrows when withDeleted is explicitly false', () => {
    const { self, where } = fakeQuery({ withDeleted: false });
    hideDeleted.call(self);
    expect(where).toHaveBeenCalledWith({ deletedAt: null });
  });

  it('narrows when withDeleted is undefined (opt-in must be truthy)', () => {
    const { self, where } = fakeQuery({ withDeleted: undefined });
    hideDeleted.call(self);
    expect(where).toHaveBeenCalledTimes(1);
  });

  it('does NOT narrow when withDeleted is true (Trash opt-out)', () => {
    const { self, where } = fakeQuery({ withDeleted: true });
    hideDeleted.call(self);
    expect(where).not.toHaveBeenCalled();
  });

  // Mongoose 9 stopped passing `next` to pre middleware. The hook used to take `next` and call
  // it, and every test above called it by hand WITH a `next` — so they kept passing while, in the
  // real app, every find/count/update on every soft-deletable model threw `next is not a function`.
  // This one lets Mongoose itself invoke the hook, the only way to hold that contract.
  it('runs as REAL Mongoose invokes it: the query reaches the database step, filtered', async () => {
    const { model } = await import('mongoose');
    // bufferCommands off, so exec() fails immediately at the (absent) connection — AFTER the
    // pre hooks have run. Scoped to this schema so nothing else in the suite is affected.
    const schema = new Schema({ name: String }, { bufferCommands: false });
    schema.plugin(softDeletePlugin);
    const Probe = model(`SoftDeleteProbe${Date.now()}`, schema);
    const q = Probe.find({ name: 'x' });
    const err = await q.exec().then(() => null, (e: Error) => e);
    expect(err?.message ?? '').not.toMatch(/next is not a function/i);
    expect(q.getFilter()).toMatchObject({ name: 'x', deletedAt: null });
  });
});

describe('SOFT_DELETE_HOOKS', () => {
  it('covers reads and bulk writes but not raw insert', () => {
    // Reads must be filtered; bulk update/delete must not touch trashed docs.
    for (const h of ['find', 'findOne', 'countDocuments', 'distinct', 'updateMany', 'deleteMany']) {
      expect(SOFT_DELETE_HOOKS).toContain(h);
    }
    // insertMany/save create new docs — nothing to hide, must stay out.
    expect(SOFT_DELETE_HOOKS as readonly string[]).not.toContain('insertMany');
    expect(SOFT_DELETE_HOOKS as readonly string[]).not.toContain('save');
  });
});

describe('softDeletePlugin', () => {
  it('adds the indexed deletedAt path to the schema', () => {
    const schema = new Schema({ title: String });
    expect(schema.path('deletedAt')).toBeUndefined();
    softDeletePlugin(schema);
    const path = schema.path('deletedAt');
    expect(path).toBeDefined();
    expect(path.instance).toBe('Date');
  });

  it('registers a pre-hook for every guarded query operation', () => {
    const schema = new Schema({ title: String });
    const spy = vi.spyOn(schema, 'pre');
    softDeletePlugin(schema);
    const hooked = spy.mock.calls.map((c) => c[0]);
    for (const h of SOFT_DELETE_HOOKS) expect(hooked).toContain(h);
    expect(spy).toHaveBeenCalledTimes(SOFT_DELETE_HOOKS.length);
    spy.mockRestore();
  });
});
