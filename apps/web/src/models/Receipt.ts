import { Schema, model, models, type Model, type InferSchemaType } from 'mongoose';

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
    currency: { type: String, default: 'EUR' },
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
  },
  { timestamps: true }
);

export type ReceiptDoc = InferSchemaType<typeof ReceiptSchema> & { _id: string };

export const Receipt: Model<ReceiptDoc> =
  (models.Receipt as Model<ReceiptDoc>) || model<ReceiptDoc>('Receipt', ReceiptSchema);
