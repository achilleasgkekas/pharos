import { Schema, model, models, type Model, type InferSchemaType } from 'mongoose';
import { softDeletePlugin } from '@/lib/softDelete';
import { createdByPlugin } from '@/lib/createdBy';

// Recurring cost-split among household members (P73). Same shape/semantics as
// Expense.split (lib/split.ts, reused as-is): you pay the charge each cycle, each
// entry is another person who owes their `share`, `settled` = paid back. Static —
// one split applies "until you change it", no per-cycle history (MVP simplicity).
const SplitEntrySchema = new Schema(
  {
    name: { type: String, default: '' },
    share: { type: Number, default: 0 },
    settled: { type: Boolean, default: false },
  },
  { _id: false }
);

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
      // Kept in sync with lib/billingCycle.ts (the single source of truth for cycles).
      enum: ['monthly', 'yearly', 'quarterly', 'weekly', 'biennial', 'lifetime'],
      default: 'monthly',
    },
    startDate: { type: Date, required: true },
    nextRenewal: { type: Date, index: true },
    // Free trial (P33): when the trial converts to a paid charge, and (optionally)
    // the amount of that first charge. Drives the "cancel before charge" reminder.
    trialEndsAt: { type: Date, default: null },
    firstChargeAmount: { type: Number, default: 0 },
    cancelledAt: { type: Date, default: null },
    // P57: explicit user confirmation; absent records start their review clock at createdAt.
    lastReviewedAt: { type: Date, default: null },
    active: { type: Boolean, default: true, index: true },
    paymentMethod: { type: String, default: '' },
    notes: { type: String, default: '' },
    url: { type: String, default: '' },

    // P68 φάση 2: ίδιο optional per-property ledger tag με το `Expense.space` (P34) και το
    // `Receipt.space` (φάση 1), από το ίδιο taxonomy `AppConfig.spaces`. '' = χωρίς χώρο,
    // που είναι κάθε συνδρομή πριν το P68, άρα καμία εγκατάσταση δεν αλλάζει από μόνη της.
    space: { type: String, default: '', index: true },

    split: { type: [SplitEntrySchema], default: [] },

    // Demo/sample-data mode (P1): see Item.isSample.
    isSample: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

// Incremental-sync cursor (lib/apiList withSince → updatedAt $gte) for GET /api/v1/subscriptions.
SubscriptionSchema.index({ updatedAt: -1 });

SubscriptionSchema.plugin(softDeletePlugin);
SubscriptionSchema.plugin(createdByPlugin); // P75: who added it (display only)

export type SubscriptionDoc = InferSchemaType<typeof SubscriptionSchema> & { _id: string };

export const Subscription: Model<SubscriptionDoc> =
  (models.Subscription as Model<SubscriptionDoc>) ||
  model<SubscriptionDoc>('Subscription', SubscriptionSchema);
