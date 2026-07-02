import { Schema, model, models, type Model, type InferSchemaType } from 'mongoose';

/**
 * SaaS CONTROL-PLANE model — lives in the central registry database. Only meaningful when
 * SAAS_MODE is on; the self-hosted single-user app never mints invites.
 *
 * A pending invitation for an email address that does NOT yet have an Account to join a
 * Tenant with a given role. This is the bridge for adding a brand-new user: the members
 * route mints one (instead of 404ing on an unregistered email), an email carries the
 * signup link, and the accept route redeems the token into an Account + Membership.
 *
 * Security: only the SHA-256 hash of the token is stored (see lib/tenancy/invites.ts), so a
 * leaked row cannot be replayed. `status` tracks the lifecycle (pending → accepted/revoked);
 * `expires` bounds redemption. Distinct from Membership, which is minted for accounts that
 * already exist — an invite is specifically for the not-yet-registered case.
 */
const InviteSchema = new Schema(
  {
    tenant: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    role: { type: String, enum: ['owner', 'admin', 'member'], default: 'member' },
    status: { type: String, enum: ['pending', 'accepted', 'revoked'], default: 'pending' },
    tokenHash: { type: String, required: true, index: true }, // SHA-256 hex — never the secret
    expires: { type: Date, required: true },
    invitedBy: { type: Schema.Types.ObjectId, ref: 'Account', default: null },
    acceptedBy: { type: Schema.Types.ObjectId, ref: 'Account', default: null },
  },
  { timestamps: true }
);

// Fast "outstanding invites for this workspace/email" lookups. Not unique — a revoked or
// expired invite may be superseded by a fresh one for the same (tenant, email).
InviteSchema.index({ tenant: 1, email: 1, status: 1 });

export type InviteDoc = InferSchemaType<typeof InviteSchema> & { _id: string };

export const Invite: Model<InviteDoc> =
  (models.Invite as Model<InviteDoc>) || model<InviteDoc>('Invite', InviteSchema);
