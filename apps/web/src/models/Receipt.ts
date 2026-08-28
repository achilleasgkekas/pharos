import { Schema, model, models, type Model, type InferSchemaType } from 'mongoose';
import { softDeletePlugin } from '@/lib/softDelete';

const LineItemSchema = new Schema(
  {
    // Not strictly required: the vision model occasionally emits a line with an
    // empty name. We sanitize on upload (fallback to refinedName), and a blank
    // here must never 500 a whole batch import.
    name: { type: String, default: '' }, // raw text as it appears on the receipt
    refinedName: { type: String, default: '' }, // AI-normalized proper product name
    qty: { type: Number, default: 1 },
    price: { type: Number, default: 0 }, // gross unit price (with VAT)
    vatRate: { type: Number, default: 24 }, // per-item VAT % (GR: 24 / 13 / 6 / 0)
    // P64: optional spend category for THIS line (from the expense taxonomy). Empty =
    // untagged, exactly the pre-P64 behaviour. Distinct from Item.category (only the few
    // lines promoted to tracked inventory) and from Expense.category (one tag for a whole
    // record): a super-market receipt mixes groceries / household / electronics per line.
    category: { type: String, default: '' },
    matchedItemId: { type: Schema.Types.ObjectId, ref: 'Item', default: null },
  },
  { _id: true }
);

const ReceiptSchema = new Schema(
  {
    store: { type: String, required: true, index: true },
    date: { type: Date, required: true, index: true },
    total: { type: Number, required: true }, // gross, with VAT
    subtotal: { type: Number, default: 0 }, // net, without VAT
    vatAmount: { type: Number, default: 0 }, // VAT / ΦΠΑ amount
    warrantyMonths: { type: Number, default: 24 }, // GR default 2 years
    // Multi-currency (P9, see lib/fx.ts). INVARIANT: `total` (and with it `subtotal`,
    // `vatAmount` and the line-item prices, which reports and the item library read)
    // is always in the deployment's BASE currency. A foreign receipt additionally
    // remembers the printed side: `currency` = printed ISO code, `origAmount` = the
    // printed total, `fxRate` = base units per 1 unit of `currency`.
    currency: { type: String, default: 'EUR' },
    origAmount: { type: Number, default: 0 }, // total as printed; 0 when not foreign
    fxRate: { type: Number, default: 0 }, // base per 1 `currency` unit; 0 = unknown/not foreign
    paymentMethod: { type: String, default: '' },
    lineItems: { type: [LineItemSchema], default: [] },

    filePath: { type: String, required: true }, // /storage/receipts/...
    fileType: { type: String, default: 'image/jpeg' },
    thumbPath: { type: String, default: '' }, // rendered 1st-page JPEG for PDF list cards
    fileSize: { type: Number, default: 0 },

    rawAiResponse: { type: String, default: '' }, // για debugging
    aiModel: { type: String, default: '' },
    aiParsedAt: { type: Date, default: null },

    verified: { type: Boolean, default: false }, // user έλεγξε το AI parsing
    // Not a real receipt (shipping/order email, marketing, etc.) — hidden from the
    // list by default and never counted as "failed" / a re-scan candidate.
    archived: { type: Boolean, default: false, index: true },
    notes: { type: String, default: '' },

    itemIds: { type: [Schema.Types.ObjectId], ref: 'Item', default: [] },

    // Demo/sample-data mode (P1): see Item.isSample.
    isSample: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

// Incremental-sync cursor (lib/apiList withSince → updatedAt $gte) for GET /api/v1/receipts.
ReceiptSchema.index({ updatedAt: -1 });

ReceiptSchema.plugin(softDeletePlugin);

export type ReceiptDoc = InferSchemaType<typeof ReceiptSchema> & { _id: string };

export const Receipt: Model<ReceiptDoc> =
  (models.Receipt as Model<ReceiptDoc>) || model<ReceiptDoc>('Receipt', ReceiptSchema);
