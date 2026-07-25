import { Schema, model, models, type Model, type InferSchemaType } from 'mongoose';
import { softDeletePlugin } from '@/lib/softDelete';

const SubscriptionSchema = new Schema(
  {
    name: { type: String, required: true },
    provider: { type: String, default: '' },
    category: {
      type: String,
      // Relaxed from an enum → free string (editable list in Settings → Lists).
      default: 'other',
    },
    amount: { type: Number, required: true },
    currency: { type: String, default: 'EUR' },
    // Multi-currency (P9): `amount` (and `firstChargeAmount`) are ALWAYS denominated in the
    // deployment's base currency, so every existing roll-up (monthly equivalent, calendar
    // agenda, reports, price-hike watch) keeps summing them untouched. A foreign-currency
    // subscription additionally remembers what its invoice actually says: `origAmount` is the
    // printed figure and `fxRate` the base units per 1 unit of `currency`. See lib/fx.ts.
    origAmount: { type: Number, default: 0 },
    fxRate: { type: Number, default: 0 },
    billingCycle: {
      type: String,
      enum: ['monthly', 'yearly', 'quarterly', 'weekly', 'lifetime'],
      default: 'monthly',
    },
    startDate: { type: Date, required: true },
    nextRenewal: { type: Date, index: true },
    // Free trial (P33): when the trial converts to a paid charge, and (optionally)
    // the amount of that first charge. Drives the "cancel before charge" reminder.
    trialEndsAt: { type: Date, default: null },
    firstChargeAmount: { type: Number, default: 0 },
    cancelledAt: { type: Date, default: null },
    active: { type: Boolean, default: true, index: true },
    paymentMethod: { type: String, default: '' },
    notes: { type: String, default: '' },
    url: { type: String, default: '' },

    // Demo/sample-data mode (P1): see Item.isSample.
    isSample: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

// Incremental-sync cursor (lib/apiList withSince → updatedAt $gte) for GET /api/v1/subscriptions.
SubscriptionSchema.index({ updatedAt: -1 });

SubscriptionSchema.plugin(softDeletePlugin);

export type SubscriptionDoc = InferSchemaType<typeof SubscriptionSchema> & { _id: string };

export const Subscription: Model<SubscriptionDoc> =
  (models.Subscription as Model<SubscriptionDoc>) ||
  model<SubscriptionDoc>('Subscription', SubscriptionSchema);
