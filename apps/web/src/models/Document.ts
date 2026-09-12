import { Schema, model, models, type Model, type InferSchemaType } from 'mongoose';
import { softDeletePlugin } from '@/lib/softDelete';

// P42 — personal document expiry tracker (passport, ID card, driving licence, residence
// permit, vehicle registration/MOT). PHAROS is a "Personal Hub", but nothing tracked the
// most basic personal papers that simply EXPIRE. Distinct from Items (owned things),
// Insurance (P38, a recurring premium) and the per-item vault (P21, files bound to an
// item): this is a person-level document with a renewal deadline.
//
// Deliberately tiny: `type` is free-form (local document names vary), `holder` is optional
// (households with more than one person, P31), status is DERIVED from expiryDate (see
// lib/documentExpiry.ts), never stored. Renewal alert reuses dispatchAlert, lead time from
// AppConfig.documentAlertDays — the same pattern as bills (P28) / trials (P33).
const DocumentSchema = new Schema(
  {
    title: { type: String, required: true }, // "Passport", "Δίπλωμα οδήγησης", "ΚΤΕΟ — Kalamos car"
    type: { type: String, default: '', index: true }, // free-form category: passport / id / licence / …
    holder: { type: String, default: '', index: true }, // whose document (name); '' = unspecified
    number: { type: String, default: '' }, // document number / reference
    issuedAt: { type: Date, default: null }, // optional
    expiryDate: { type: Date, required: true, index: true },
    notes: { type: String, default: '' },
    archived: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

// Incremental-sync cursor, consistent with the other record models.
DocumentSchema.index({ updatedAt: -1 });

DocumentSchema.plugin(softDeletePlugin);

export type DocumentDoc = InferSchemaType<typeof DocumentSchema> & { _id: string };

export const Document: Model<DocumentDoc> =
  (models.Document as Model<DocumentDoc>) || model<DocumentDoc>('Document', DocumentSchema);
