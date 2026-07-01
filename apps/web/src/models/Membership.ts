import { Schema, model, models, type Model, type InferSchemaType } from 'mongoose';

/**
 * SaaS CONTROL-PLANE model — lives in the central registry database. Only meaningful
 * when SAAS_MODE is on.
 *
 * Joins an `Account` (global login) to a `Tenant` (workspace) with a role. One account
 * can belong to many tenants; one tenant has many members. The role gates control-plane
 * actions inside that tenant:
 *   - owner:  billing + delete tenant + everything an admin can do (exactly one per tenant)
 *   - admin:  manage members + tenant settings
 *   - member: use the app; no member/billing management
 *
 * NOTE: this is the SaaS org role, distinct from the per-tenant `User.role`
 * (admin/member) that gates system settings INSIDE a tenant's data database.
 */
const MembershipSchema = new Schema(
  {
    account: { type: Schema.Types.ObjectId, ref: 'Account', required: true, index: true },
    tenant: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    role: { type: String, enum: ['owner', 'admin', 'member'], default: 'member' },
    // Invite lifecycle: 'invited' until the account accepts (or is auto-active on signup).
    status: { type: String, enum: ['invited', 'active', 'removed'], default: 'active' },
    invitedBy: { type: Schema.Types.ObjectId, ref: 'Account', default: null },
  },
  { timestamps: true }
);

// One membership per (account, tenant) pair.
MembershipSchema.index({ account: 1, tenant: 1 }, { unique: true });

export type MembershipDoc = InferSchemaType<typeof MembershipSchema> & { _id: string };

export const Membership: Model<MembershipDoc> =
  (models.Membership as Model<MembershipDoc>) || model<MembershipDoc>('Membership', MembershipSchema);
