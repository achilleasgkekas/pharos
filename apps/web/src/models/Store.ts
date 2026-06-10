import { Schema, model, models, type Model, type InferSchemaType } from 'mongoose';

/**
 * User-editable store list (managed from /settings). Seeded once from the curated
 * lib/stores.ts list, then maintained in the DB so receipts can auto-add unknown
 * shops and the user can rename/merge/delete them.
 */
const StoreSchema = new Schema(
  {
    name: { type: String, required: true, unique: true }, // canonical display name
    aliases: { type: [String], default: [] }, // lowercased match terms
    url: { type: String, default: '' },
    // true when created automatically from a receipt the AI couldn't match —
    // surfaces "needs review" stores in the management UI.
    auto: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export type StoreDoc = InferSchemaType<typeof StoreSchema> & { _id: string };

export const Store: Model<StoreDoc> =
  (models.Store as Model<StoreDoc>) || model<StoreDoc>('Store', StoreSchema);
