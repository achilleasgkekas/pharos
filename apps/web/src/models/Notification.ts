import { Schema, model, models, type Model, type InferSchemaType } from 'mongoose';
import { softDeletePlugin } from '@/lib/softDelete';
import { NOTIF_KINDS } from '@/lib/notificationKinds';

/** In-app notification (the bell). Shared across users like the rest of the app.
 *  `dedupeKey` makes each logical alert (a deal, a warranty, this month's
 *  installments) appear exactly once — re-checks refresh it instead of piling up. */
const NotificationSchema = new Schema(
  {
    dedupeKey: { type: String, required: true, index: true },
    kind: { type: String, enum: [...NOTIF_KINDS], default: 'system', index: true },
    title: { type: String, default: '' }, // optional — installments derive their heading in the bell

    body: { type: String, default: '' },
    href: { type: String, default: '' }, // deep-link opened on click
    read: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

NotificationSchema.plugin(softDeletePlugin);

export type NotificationDoc = InferSchemaType<typeof NotificationSchema> & { _id: string };

export const Notification: Model<NotificationDoc> =
  (models.Notification as Model<NotificationDoc>) || model<NotificationDoc>('Notification', NotificationSchema);
