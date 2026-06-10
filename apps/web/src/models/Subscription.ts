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
    billingCycle: {
      type: String,
      enum: ['monthly', 'yearly', 'quarterly', 'weekly', 'lifetime'],
      default: 'monthly',
    },
    startDate: { type: Date, required: true },
    nextRenewal: { type: Date, index: true },
    cancelledAt: { type: Date, default: null },
    active: { type: Boolean, default: true, index: true },
    paymentMethod: { type: String, default: '' },
    notes: { type: String, default: '' },
    url: { type: String, default: '' },
  },
  { timestamps: true }
);

SubscriptionSchema.plugin(softDeletePlugin);

export type SubscriptionDoc = InferSchemaType<typeof SubscriptionSchema> & { _id: string };

export const Subscription: Model<SubscriptionDoc> =
  (models.Subscription as Model<SubscriptionDoc>) ||
  model<SubscriptionDoc>('Subscription', SubscriptionSchema);
