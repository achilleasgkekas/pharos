import { Schema, model, models, type Model, type InferSchemaType } from 'mongoose';
import { softDeletePlugin } from '@/lib/softDelete';

const PriceEntrySchema = new Schema(
  {
    price: { type: Number, required: true },
    store: { type: String, required: true },
    url: { type: String, default: '' },
    currency: { type: String, default: 'EUR' },
    date: { type: Date, default: Date.now },
    inStock: { type: Boolean, default: true },
  },
  { _id: true }
);

const LinkSchema = new Schema(
  {
    label: { type: String, required: true },
    url: { type: String, required: true },
    // Latest known price at this specific store-link. Seeded on URL import and
    // refreshed by the scraper every pass; null until first priced.
    price: { type: Number, default: null },
  },
  { _id: false }
);

const ItemSchema = new Schema(
  {
    num: { type: String, default: '' },
    title: { type: String, required: true, index: 'text' },
    category: {
      type: String,
      // Relaxed from an enum → free string so users can add custom categories
      // (the suggested list is editable in Settings → Lists).
      default: 'other',
    },
    status: {
      type: String,
      enum: ['researching', 'decided', 'ordered', 'received', 'installed', 'deferred', 'sold', 'broken'],
      default: 'researching',
      index: true,
    },
    specs: { type: String, default: '' },
    notes: { type: String, default: '' },
    tags: { type: [String], default: [], index: true },

    currentPrice: { type: Number, default: 0 },
    purchasedPrice: { type: Number, default: null },
    purchasedAt: { type: Date, default: null },
    purchasedFrom: { type: String, default: '' },
    // Price-tracker target (shopping): alert when the best known price drops to/below this.
    targetPrice: { type: Number, default: null },

    priceHistory: { type: [PriceEntrySchema], default: [] },
    links: { type: [LinkSchema], default: [] },

    receiptIds: { type: [Schema.Types.ObjectId], ref: 'Receipt', default: [] },
    photos: { type: [String], default: [] },

    warrantyUntil: { type: Date, default: null },
    serialNumber: { type: String, default: '' },
    location: { type: String, default: '' }, // where it physically lives (room / rack / shelf)

    aiFilledAt: { type: Date, default: null }, // last time AI fill-from-web enriched it (status badge → don't re-do)
  },
  { timestamps: true }
);

ItemSchema.index({ title: 'text', specs: 'text', notes: 'text' });
// Incremental-sync cursor (lib/apiList withSince → updatedAt $gte) AND sort key for GET /api/v1/items.
ItemSchema.index({ updatedAt: -1 });

ItemSchema.plugin(softDeletePlugin);

export type ItemDoc = InferSchemaType<typeof ItemSchema> & { _id: string };

export const Item: Model<ItemDoc> =
  (models.Item as Model<ItemDoc>) || model<ItemDoc>('Item', ItemSchema);
