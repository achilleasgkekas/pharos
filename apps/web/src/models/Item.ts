import { Schema, model, models, type Model, type InferSchemaType } from 'mongoose';
import { softDeletePlugin } from '@/lib/softDelete';

// Single source of truth for item status. Used by the schema enum AND by the
// /api/v1/items POST + PATCH routes (whitelist validation) so they never drift.
export const ITEM_STATUSES = ['researching', 'decided', 'ordered', 'received', 'installed', 'deferred', 'sold', 'broken'] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];

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

// Document / manual vault (P21): manuals, warranty certs, serial-number photos —
// an ongoing per-item repository, distinct from `photos` (product gallery shots).
const AttachmentSchema = new Schema(
  {
    path: { type: String, required: true }, // storage-relative path (equipment bucket, reused)
    name: { type: String, default: '' },
    mimeType: { type: String, default: '' },
    size: { type: Number, default: 0 },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

// P70: user-named attributes (MAC address, rack unit, firmware revision, licence key).
// Distinct from `specs`, which is one free text blob: here the value carries its own label,
// so it can be read back and searched by name. Keys are free strings, same relaxed idiom as
// `category`. Normalisation, dedupe and the size caps live in lib/customFields.ts.
const CustomFieldSchema = new Schema(
  {
    key: { type: String, required: true },
    value: { type: String, default: '' },
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
      enum: [...ITEM_STATUSES],
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

    // Multi-currency (P9): every price field above is ALWAYS denominated in the deployment's
    // base currency, so net worth, the insurance export, inventory value by category and the
    // shopping budget keep summing them untouched and no migration is needed. An item bought
    // abroad additionally remembers what its receipt actually said: `origAmount` is the printed
    // ANCHOR price (what you paid when the item is owned, otherwise its asking price) and
    // `fxRate` the base units per 1 unit of `currency`. That one rate converts every price field
    // on the record, so a single item never mixes two currencies. See lib/fx.ts.
    // NOTE: priceHistory[].currency is a different, older thing (per-store scraped quotes) and is
    // deliberately untouched here.
    currency: { type: String, default: '' },
    origAmount: { type: Number, default: 0 },
    fxRate: { type: Number, default: 0 },

    priceHistory: { type: [PriceEntrySchema], default: [] },
    links: { type: [LinkSchema], default: [] },

    receiptIds: { type: [Schema.Types.ObjectId], ref: 'Receipt', default: [] },
    photos: { type: [String], default: [] },
    attachments: { type: [AttachmentSchema], default: [] },

    // P55: what actually happened when the item left the house. Only meaningful while
    // `status` is 'sold'; all-empty keeps the pre-P55 behaviour, where 'sold' was a bare
    // label that stored nothing. NOTE: unlike the three purchase-side prices above,
    // `soldPrice` is ALWAYS in the deployment's base currency and is never FX-converted —
    // `fxRate` belongs to the ORIGINAL receipt, and a later resale is a different
    // transaction (usually local), so reusing that rate would invent a number.
    soldPrice: { type: Number, default: null },
    soldAt: { type: Date, default: null },
    soldTo: { type: String, default: '' }, // free-form: a person, a marketplace, a shop
    // Set once the optional "log as income" button has actually created the linked
    // Expense(kind='income'), so a second click cannot double-count the same sale.
    soldIncomeId: { type: Schema.Types.ObjectId, ref: 'Expense', default: null },

    // P72: where the parcel is, while `status` is 'ordered'. Free-string carrier (same
    // relaxed-enum idiom as category/status) so an unlisted courier still saves; the
    // optional `trackingUrl` is a manual override for when a courier changes its public
    // URL scheme, and beats the guessed template in lib/tracking.ts. No API polling.
    trackingNumber: { type: String, default: '' },
    carrier: { type: String, default: '' },
    trackingUrl: { type: String, default: '' },

    // P70: optional named attributes. Empty array = exactly the pre-P70 record.
    customFields: { type: [CustomFieldSchema], default: [] },

    warrantyUntil: { type: Date, default: null },
    serialNumber: { type: String, default: '' },
    location: { type: String, default: '' }, // where it physically lives (room / rack / shelf)

    aiFilledAt: { type: Date, default: null }, // last time AI fill-from-web enriched it (status badge → don't re-do)

    // Demo/sample-data mode (P1): true for records seeded by "Load sample data" in
    // Settings → Storage & backup, so they can be cleanly wiped without touching real data.
    isSample: { type: Boolean, default: false, index: true },
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
