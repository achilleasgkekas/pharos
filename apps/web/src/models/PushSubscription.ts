import { Schema, model, models, type Model, type InferSchemaType } from 'mongoose';

/**
 * A Web Push subscription (P102) — one per browser/device that opted into native
 * browser notifications. The endpoint is the push-service URL the browser handed us
 * (unique per subscription); `keys.p256dh`/`keys.auth` are the client public key and
 * auth secret the payload is encrypted against (RFC 8291). No external account is
 * involved: this is the only notifier channel that talks to no third-party server of
 * ours. Stored per-tenant like everything else, so one household's devices never see
 * another's alerts.
 *
 * Expired/unsubscribed endpoints are pruned silently on the next failed send (a 404/410
 * from the push service), per the P102 MVP — no separate stale-subscription UI.
 */
const PushSubscriptionSchema = new Schema(
  {
    endpoint: { type: String, required: true, unique: true },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },
    // Best-effort label so a future "your devices" list can name them; not required.
    userAgent: { type: String, default: '' },
  },
  { timestamps: true }
);

export type PushSubscriptionDoc = InferSchemaType<typeof PushSubscriptionSchema> & { _id: string };

export const PushSubscription: Model<PushSubscriptionDoc> =
  (models.PushSubscription as Model<PushSubscriptionDoc>) ||
  model<PushSubscriptionDoc>('PushSubscription', PushSubscriptionSchema);
