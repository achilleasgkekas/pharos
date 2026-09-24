import type { Schema, Query } from 'mongoose';

/**
 * Soft-delete (Trash) plugin. Adds `deletedAt` and hides trashed docs from every
 * find/count/distinct automatically, so no page or report needs to remember the
 * filter. Pass `.setOptions({ withDeleted: true })` to see trashed docs (Trash UI).
 *
 * Delete actions SET deletedAt instead of removing; restore clears it; "purge"
 * really deletes (doc + binary files + cross-references). Statements are NOT
 * soft-deleted — their unique {card, period} index would block re-importing the
 * same month while a trashed copy holds the slot.
 */
// Every read/write query hook the plugin guards. Bulk update/delete are included so
// merges/reference-cleanups don't rewrite or remove trashed docs. Trash ops that DO
// target trashed docs (restore / purge / restore-import) pass
// .setOptions({ withDeleted: true }) to opt out.
export const SOFT_DELETE_HOOKS = [
  'find', 'findOne', 'findOneAndUpdate', 'findOneAndDelete', 'countDocuments', 'distinct',
  'updateOne', 'updateMany', 'deleteOne', 'deleteMany', 'replaceOne',
] as const;

/**
 * The pre-hook body registered on every {@link SOFT_DELETE_HOOKS} query. Exported for
 * tests. Mongoose invokes it with the Query as `this`. Unless the caller opted in with
 * `.setOptions({ withDeleted: true })`, it narrows the query to non-trashed docs
 * (`deletedAt: null`).
 *
 * NO `next` parameter, on purpose. It used to take `next` and call it, which Mongoose 8
 * supported and Mongoose 9 removed: pre middleware no longer receives `next` at all. With the
 * old signature, every find/count/update on every soft-deletable model threw
 * `next is not a function` — i.e. the whole app — and neither the compiler nor the tests
 * noticed. The registration below casts to `any`, so tsc could not see the mismatch, and the
 * unit test called this function by hand with its own `next`. A synchronous body with no
 * parameter works on both 8 and 9, and the query proceeds when it returns.
 */
export function hideDeleted(this: Query<unknown, unknown>): void {
  if (!this.getOptions().withDeleted) this.where({ deletedAt: null });
}

export function softDeletePlugin(schema: Schema): void {
  schema.add({ deletedAt: { type: Date, default: null, index: true } });

  for (const hook of SOFT_DELETE_HOOKS) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    schema.pre(hook as any, hideDeleted);
  }
}
