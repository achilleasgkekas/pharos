import type { Model } from 'mongoose';
import type { ShoppingListItemDoc } from '@/models/ShoppingListItem';

// Typed with the real document rather than `Model<unknown>`: Mongoose 9 checks filter keys
// against the schema, so an `unknown` model no longer accepts the real one — and naming the
// document means a renamed field in the filter below is now a compile error, not a no-op query.
type RestockModel = Pick<Model<ShoppingListItemDoc>, 'updateMany'>;

/** Refresh derived list state on read; this is not user-authored mutation. */
export async function resurfaceDueRestocks(model: RestockModel, now = new Date()): Promise<void> {
  await model.updateMany(
    { checked: true, restockIntervalDays: { $gt: 0 }, lastRestockedAt: { $type: 'date' }, $expr: { $lte: ['$lastRestockedAt', { $subtract: [now, { $multiply: ['$restockIntervalDays', 86_400_000] }] }] } },
    { $set: { checked: false } }
  );
}
