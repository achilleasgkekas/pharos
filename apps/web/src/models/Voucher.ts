import { Schema, model, models, type Model, type InferSchemaType } from 'mongoose';
import { softDeletePlugin } from '@/lib/softDelete';

const VoucherSchema = new Schema(
  {
    title: { type: String, required: true }, // "10% off at Skroutz"
    code: { type: String, default: '', index: true }, // "SAVE10"
    store: { type: String, default: '', index: true }, // "Skroutz"
    discount: { type: String, default: '' }, // "10%" or "€5" or "free shipping"
    expiresAt: { type: Date, default: null, index: true },
    used: { type: Boolean, default: false, index: true },
    url: { type: String, default: '' },
    notes: { type: String, default: '' },
  },
  { timestamps: true }
);

// Incremental-sync cursor (lib/apiList withSince → updatedAt $gte) for GET /api/v1/vouchers.
VoucherSchema.index({ updatedAt: -1 });

VoucherSchema.plugin(softDeletePlugin);

export type VoucherDoc = InferSchemaType<typeof VoucherSchema> & { _id: string };

export const Voucher: Model<VoucherDoc> =
  (models.Voucher as Model<VoucherDoc>) || model<VoucherDoc>('Voucher', VoucherSchema);
