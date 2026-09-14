import type { Model } from 'mongoose';

type RestockModel = Pick<Model<unknown>, 'updateMany'>;

/** Refresh derived list state on read; this is not user-authored mutation. */
export async function resurfaceDueRestocks(model: RestockModel, now = new Date()): Promise<void> {
  await model.updateMany(
    { checked: true, restockIntervalDays: { $gt: 0 }, lastRestockedAt: { $type: 'date' }, $expr: { $lte: ['$lastRestockedAt', { $subtract: [now, { $multiply: ['$restockIntervalDays', 86_400_000] }] }] } },
    { $set: { checked: false } }
  );
}
