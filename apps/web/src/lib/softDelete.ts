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
 * (`deletedAt: null`). Always calls `next()` so the query proceeds either way.
 */
export function hideDeleted(this: Query<unknown, unknown>, next: () => void): void {
  if (!this.getOptions().withDeleted) this.where({ deletedAt: null });
  next();
}

export function softDeletePlugin(schema: Schema): void {
  schema.add({ deletedAt: { type: Date, default: null, index: true } });

  for (const hook of SOFT_DELETE_HOOKS) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    schema.pre(hook as any, hideDeleted);
  }
}
