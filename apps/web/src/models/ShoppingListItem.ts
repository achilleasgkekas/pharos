import { Schema, model, models, type Model, type InferSchemaType } from 'mongoose';
import { softDeletePlugin } from '@/lib/softDelete';

/** A lightweight, shared "to-buy" list entry — separate from the product-tracking
 *  Items (no prices/specs/links). Added by hand or by photographing a product. */
const ShoppingListItemSchema = new Schema(
  {
    name: { type: String, required: true },
    quantity: { type: String, default: '' }, // free text: "2", "500g", "pack of 6"
    category: { type: String, default: '' },
    brand: { type: String, default: '' },
    note: { type: String, default: '' },
    checked: { type: Boolean, default: false, index: true }, // bought
    restockIntervalDays: { type: Number, min: 1 },
    lastRestockedAt: { type: Date },
    aiScanned: { type: Boolean, default: false }, // captured via product photo
  },
  { timestamps: true }
);

ShoppingListItemSchema.plugin(softDeletePlugin);

export type ShoppingListItemDoc = InferSchemaType<typeof ShoppingListItemSchema> & { _id: string };

export const ShoppingListItem: Model<ShoppingListItemDoc> =
  (models.ShoppingListItem as Model<ShoppingListItemDoc>) || model<ShoppingListItemDoc>('ShoppingListItem', ShoppingListItemSchema);
