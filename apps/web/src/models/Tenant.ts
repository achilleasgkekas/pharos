import { Schema, model, models, type Model, type InferSchemaType } from 'mongoose';

/**
 * SaaS CONTROL-PLANE model — lives in the central registry database (the default
 * MONGO_URI connection), NOT in a tenant's own data database. Only meaningful when
 * SAAS_MODE is on; the self-hosted single-user app never creates Tenant docs.
 *
 * A Tenant is one customer workspace/org. Its actual data (Items, Receipts, …) lives
 * in a SEPARATE per-tenant database named by `dbName` (database-per-tenant isolation,
 * see SAAS_PROGRESS.md → Architecture). The existing feature models/queries stay
 * untouched — a per-request connection is scoped to `useDb(dbName)` when SAAS_MODE is
 * on. This model only holds the routing + plan + status metadata.
 */
const TenantSchema = new Schema(
  {
    // Subdomain label + primary routing key: <slug>.ph-aros.com. Lowercase DNS label.
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true }, // display name
    // Name of this tenant's isolated data database, e.g. "tenant_<slug>". Set at
    // provisioning; never reused across tenants (GDPR delete = drop this db).
    dbName: { type: String, required: true, unique: true },
    // Optional custom domain (dedicated/top tier). Unique when set; sparse so many
    // tenants can leave it null.
    customDomain: { type: String, default: null, unique: true, sparse: true, lowercase: true, trim: true },
    // Current plan key — resolved to entitlements in lib/billing/entitlements.ts.
    plan: { type: String, enum: ['free', 'shared', 'dedicated'], default: 'free' },
    // Lifecycle: trialing/active use the app; suspended/canceled block access (dunning,
    // manual hold). pending = provisioned, not yet ready.
    status: {
      type: String,
      enum: ['pending', 'trialing', 'active', 'suspended', 'canceled'],
      default: 'trialing',
    },
    // Isolation tier: 'shared' = own db on the shared cluster; 'dedicated' = own instance.
    tier: { type: String, enum: ['shared', 'dedicated'], default: 'shared' },
    trialEndsAt: { type: Date, default: null },
    // Idempotency stamp for the pre-suspend dunning email (D4): set when the "your trial
    // ends in N days" warning was successfully delivered, so the 6-hourly sweep never
    // re-warns a tenant. Null = not warned yet. Only written by the trial-lapse sweep.
    trialWarnEmailedAt: { type: Date, default: null },
    // Billing provider linkage (Stripe). Stored here so a webhook can resolve tenant.
    billingCustomerId: { type: String, default: null, index: true },
    billingSubscriptionId: { type: String, default: null, index: true },
    // BYO-key (TODO §11): this tenant supplies its OWN AI provider key, so their AI calls
    // cost the platform nothing → they are NOT metered against the plan's AI volume and are
    // never blocked on AI quota (effectively unlimited AI). See lib/billing/aiKeyPolicy.ts.
    // This is only the FLAG; the encrypted key itself is stored/managed separately (TODO
    // §14 encryption at rest — Needs Achilleas). Default false = use the platform's shared
    // AI key + normal per-plan metering.
    aiByoKey: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export type TenantDoc = InferSchemaType<typeof TenantSchema> & { _id: string };

export const Tenant: Model<TenantDoc> =
  (models.Tenant as Model<TenantDoc>) || model<TenantDoc>('Tenant', TenantSchema);
