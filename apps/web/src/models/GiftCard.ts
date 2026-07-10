import { Schema, model, models, type Model, type InferSchemaType } from 'mongoose';
import { softDeletePlugin } from '@/lib/softDelete';

// A single spend (or reload) against the card. Positive amount = money used;
// negative amount = a top-up/reload (some store credits get recharged). Balance
// is always initialAmount − Σ(uses.amount), so both directions just work.
const GiftCardUseSchema = new Schema(
  {
    amount: { type: Number, required: true },
    date: { type: Date, default: () => new Date() },
    note: { type: String, default: '' },
  },
  { _id: true }
);

// P32 — gift-card / store-credit / prepaid balance tracker. Distinct from Voucher
// (a coupon: % off / code) and from the loyalty barcode wallet (P20): this holds a
// real MONETARY balance that decreases as you spend it. Lives as a tab in /vouchers.
const GiftCardSchema = new Schema(
  {
    title: { type: String, required: true }, // "IKEA gift card", "Public store credit"
    store: { type: String, default: '', index: true }, // where it can be spent
    code: { type: String, default: '' }, // card number / redemption code
    initialAmount: { type: Number, required: true, default: 0 }, // face value when loaded
    expiresAt: { type: Date, default: null, index: true },
    archived: { type: Boolean, default: false, index: true }, // manually closed (spent/void)
    notes: { type: String, default: '' },
    uses: { type: [GiftCardUseSchema], default: [] },
  },
  { timestamps: true }
);

// Incremental-sync cursor (lib/apiList withSince → updatedAt $gte) for a future GET /api/v1/giftcards.
GiftCardSchema.index({ updatedAt: -1 });

GiftCardSchema.plugin(softDeletePlugin);

export type GiftCardDoc = InferSchemaType<typeof GiftCardSchema> & { _id: string };

export const GiftCard: Model<GiftCardDoc> =
  (models.GiftCard as Model<GiftCardDoc>) || model<GiftCardDoc>('GiftCard', GiftCardSchema);
