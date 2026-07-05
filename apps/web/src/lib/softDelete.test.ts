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
    const next = vi.fn();
    hideDeleted.call(self, next);
    expect(where).toHaveBeenCalledTimes(1);
    expect(where).toHaveBeenCalledWith({ deletedAt: null });
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('narrows when withDeleted is explicitly false', () => {
    const { self, where } = fakeQuery({ withDeleted: false });
    hideDeleted.call(self, vi.fn());
    expect(where).toHaveBeenCalledWith({ deletedAt: null });
  });

  it('narrows when withDeleted is undefined (opt-in must be truthy)', () => {
    const { self, where } = fakeQuery({ withDeleted: undefined });
    hideDeleted.call(self, vi.fn());
    expect(where).toHaveBeenCalledTimes(1);
  });

  it('does NOT narrow when withDeleted is true (Trash opt-out)', () => {
    const { self, where } = fakeQuery({ withDeleted: true });
    const next = vi.fn();
    hideDeleted.call(self, next);
    expect(where).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('always calls next() so the query proceeds (both branches)', () => {
    const on = vi.fn();
    hideDeleted.call(fakeQuery({}).self, on);
    expect(on).toHaveBeenCalledTimes(1);
    const off = vi.fn();
    hideDeleted.call(fakeQuery({ withDeleted: true }).self, off);
    expect(off).toHaveBeenCalledTimes(1);
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
