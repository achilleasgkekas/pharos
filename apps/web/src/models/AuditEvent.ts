import { Schema, model, models, type Model, type InferSchemaType } from 'mongoose';

/**
 * SaaS CONTROL-PLANE model — lives in the central registry database. Only meaningful when
 * SAAS_MODE is on; the self-hosted single-user app never records audit events.
 *
 * An append-only trail of security- and billing-relevant events per Tenant: who did what,
 * to which target, and when. This is the surface a workspace-settings "Activity" view (and
 * later, compliance export) reads from. It answers "who removed that member / changed that
 * role / minted that invite / switched that plan".
 *
 * Security: this collection MUST NEVER hold a secret. The recorder (lib/tenancy/audit.ts)
 * redacts sensitive keys (token/password/secret/hash) from `meta` before insert, and the
 * serializer only projects whitelisted fields. Rows are immutable by convention — nothing
 * updates an AuditEvent after insert.
 */
const AuditEventSchema = new Schema(
  {
    tenant: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    // The Account that performed the action. Null for system-originated events (e.g. a
    // Stripe webhook flipping a plan) where no human actor is attributable.
    actor: { type: Schema.Types.ObjectId, ref: 'Account', default: null },
    // A stable machine-readable verb (see AUDIT_ACTIONS in lib/tenancy/audit.ts). Kept as a
    // free String (not a mongoose enum) so adding a new action type never requires a schema
    // migration; validation lives in the recorder.
    action: { type: String, required: true },
    // Optional human-readable pointer at what was acted on (an email, a slug, a short id).
    // Never a secret; purely for display in the activity list.
    target: { type: String, default: null },
    // Redacted, display-safe context (e.g. { role: 'admin', from: 'member' }). Mixed so
    // each action can carry its own shape; the recorder strips sensitive keys first.
    meta: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Fast "activity for this workspace, newest first" and "…filtered by action" lookups.
AuditEventSchema.index({ tenant: 1, createdAt: -1 });
AuditEventSchema.index({ tenant: 1, action: 1, createdAt: -1 });

export type AuditEventDoc = InferSchemaType<typeof AuditEventSchema> & { _id: string };

export const AuditEvent: Model<AuditEventDoc> =
  (models.AuditEvent as Model<AuditEventDoc>) ||
  model<AuditEventDoc>('AuditEvent', AuditEventSchema);
