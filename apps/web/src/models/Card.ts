import { Schema, model, models, type Model, type InferSchemaType } from 'mongoose';

const CardSchema = new Schema(
  {
    name: { type: String, required: true }, // e.g. "Mastercard 1234"
    last4: { type: String, default: '' }, // "1234"
    bank: { type: String, default: '' }, // e.g. "Alpha Bank", "Chase"
    kind: {
      type: String,
      enum: ['credit', 'debit'],
      default: 'credit',
    },
    type: {
      type: String,
      enum: ['mastercard', 'visa', 'amex', 'maestro', 'other'],
      default: 'other',
    },
    color: { type: String, default: '#00d4ff' }, // UI accent
    creditLimit: { type: Number, default: 0 },
    notes: { type: String, default: '' },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export type CardDoc = InferSchemaType<typeof CardSchema> & { _id: string };

export const Card: Model<CardDoc> =
  (models.Card as Model<CardDoc>) || model<CardDoc>('Card', CardSchema);
