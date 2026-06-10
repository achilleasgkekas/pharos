import { Schema, model, models, type Model, type InferSchemaType } from 'mongoose';

const TransactionSchema = new Schema(
  {
    date: { type: Date, required: true },
    description: { type: String, required: true },
    amount: { type: Number, required: true },
    category: { type: String, default: 'uncategorized' },
    installmentInfo: {
      type: {
        currentInstallment: Number,
        totalInstallments: Number,
        originalPurchase: String,
        // Manual grouping override (see SerializedTransaction). Lets two charges with
        // different printed descriptions ("QUEST ONLINE" vs "QUEST ONLINE KALLITHEA")
        // be bound into the same installment plan.
        planKey: String,
      },
      default: null,
    },
    // A single installment charge can map to MULTIPLE products when they were
    // bought together on one receipt (one card charge, many items).
    matchedItemIds: { type: [{ type: Schema.Types.ObjectId, ref: 'Item' }], default: [] },
    matchedReceiptId: { type: Schema.Types.ObjectId, ref: 'Receipt', default: null },
  },
  { _id: true }
);

const StatementSchema = new Schema(
  {
    card: { type: String, required: true, index: true }, // e.g. "Mastercard 1234"
    last4: { type: String, default: '', index: true }, // last 4 digits, for matching
    cardId: { type: Schema.Types.ObjectId, ref: 'Card', default: null, index: true },
    period: { type: String, required: true, index: true }, // e.g. "2026-06"
    statementDate: { type: Date, required: true },
    dueDate: { type: Date },
    totalAmount: { type: Number, required: true },
    minimumPayment: { type: Number, default: 0 },
    paidAmount: { type: Number, default: 0 },
    currency: { type: String, default: 'EUR' },
    transactions: { type: [TransactionSchema], default: [] },
    filePath: { type: String, default: '' }, // PDF location
    notes: { type: String, default: '' },
  },
  { timestamps: true }
);

StatementSchema.index({ card: 1, period: 1 }, { unique: true });

export type StatementDoc = InferSchemaType<typeof StatementSchema> & { _id: string };

export const Statement: Model<StatementDoc> =
  (models.Statement as Model<StatementDoc>) || model<StatementDoc>('Statement', StatementSchema);
