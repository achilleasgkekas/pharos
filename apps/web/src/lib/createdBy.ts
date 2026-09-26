import { Schema, type Query } from 'mongoose';
import { currentActorId } from './actor';

/**
 * P75 (#20) — `createdBy` attribution plugin. Adds `createdBy` (the User who created the
 * record) and fills it in on creation, so no create path has to remember to.
 *
 * Purely additive: nothing reads it for permissions, and it is only SHOWN once an instance has
 * two or more users (see lib/attribution.ts). Records created before P75, or by work with no
 * user behind it (background jobs, cron), keep `null` = unknown. Nothing is backfilled by
 * guessing, and a value the caller already set is never overwritten.
 *
 * Covers `Model.create` / `doc.save()` (the `save` hook) and `Model.insertMany` (CSV imports,
 * sample data). `bulkWrite` inserts and upserts are not covered; the backup restore goes
 * through upserts on purpose, so a restored record keeps the author it was backed up with
 * instead of being re-attributed to whoever pressed Restore.
 */
export function createdByPlugin(schema: Schema): void {
  schema.add({
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    // P89 (#23): who moved it to Trash. Set and cleared by the query hook below, so none of the
    // ~30 delete paths (each one an update that sets deletedAt) has to know about it.
    deletedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  });

  schema.pre('save', async function () {
    if (!this.isNew || this.get('createdBy')) return;
    const actor = await currentActorId();
    if (actor) this.set('createdBy', actor);
  });

  for (const hook of ['updateOne', 'updateMany', 'findOneAndUpdate'] as const) {
    schema.pre(hook, stampDeletedBy);
  }

  schema.pre('insertMany', async function (docs: unknown) {
    const list = (Array.isArray(docs) ? docs : [docs]) as Array<Record<string, unknown> | null>;
    if (!list.some((d) => d && d.createdBy == null)) return;
    const actor = await currentActorId();
    if (!actor) return;
    for (const d of list) if (d && d.createdBy == null) d.createdBy = actor;
  });
}

/**
 * P89 (#23) — record who trashed a record. Every soft delete in the app is an update that sets
 * `deletedAt` (see lib/softDelete.ts), so this watches for exactly that: a date means "trashed
 * now, by the current actor"; null means "restored", which clears the name as well. Updates
 * that do not touch deletedAt pass through untouched. Exported for tests.
 */
export async function stampDeletedBy(this: Query<unknown, unknown>): Promise<void> {
  const update = this.getUpdate() as Record<string, unknown> | null;
  if (!update || Array.isArray(update)) return; // pipeline updates are never soft deletes
  const $set = (update.$set ?? {}) as Record<string, unknown>;
  const touched = 'deletedAt' in $set ? $set.deletedAt : 'deletedAt' in update ? update.deletedAt : undefined;
  if (touched === undefined) return;
  this.set('deletedBy', touched == null ? null : await currentActorId());
}
