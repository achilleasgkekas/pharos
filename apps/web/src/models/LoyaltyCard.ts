import { Schema, model, models, type Model, type InferSchemaType } from 'mongoose';
import { softDeletePlugin } from '@/lib/softDelete';

// P20 — loyalty/membership card wallet: store the card number + barcode format
// so tapping it shows a scannable barcode at checkout. Distinct from Voucher (a
// coupon: % off/code) and GiftCard (P32, a decreasing monetary balance) — this
// card carries no balance, it's just an ID the till scans. Lives as a tab in
// /vouchers alongside them (VouchersShell).
const LoyaltyCardSchema = new Schema(
  {
    title: { type: String, required: true }, // "AB Card", "Fuel Plus"
    store: { type: String, default: '', index: true },
    cardNumber: { type: String, required: true }, // digits/text printed under the barcode
    barcodeFormat: { type: String, default: 'CODE128' }, // CODE128 | EAN13 | UPC | CODE39, see lib/loyaltyCard.ts
    notes: { type: String, default: '' },
    archived: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

// Incremental-sync cursor (lib/apiList withSince → updatedAt $gte) for a future GET /api/v1/loyaltycards.
LoyaltyCardSchema.index({ updatedAt: -1 });

LoyaltyCardSchema.plugin(softDeletePlugin);

export type LoyaltyCardDoc = InferSchemaType<typeof LoyaltyCardSchema> & { _id: string };

export const LoyaltyCard: Model<LoyaltyCardDoc> =
  (models.LoyaltyCard as Model<LoyaltyCardDoc>) || model<LoyaltyCardDoc>('LoyaltyCard', LoyaltyCardSchema);
