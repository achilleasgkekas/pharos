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
export function softDeletePlugin(schema: Schema): void {
  schema.add({ deletedAt: { type: Date, default: null, index: true } });

  const HOOKS = ['find', 'findOne', 'findOneAndUpdate', 'findOneAndDelete', 'countDocuments', 'distinct'] as const;
  for (const hook of HOOKS) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    schema.pre(hook as any, function (this: Query<unknown, unknown>, next: () => void) {
      if (!this.getOptions().withDeleted) this.where({ deletedAt: null });
      next();
    });
  }
}
