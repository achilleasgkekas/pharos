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
    // Optional custom domain (dedicated/top tier). Unique when SET — see the partial index
    // below, which is what actually makes that true. NOT declared unique/sparse here: a sparse
    // index skips documents where the field is MISSING, but `default: null` writes an explicit
    // null on every tenant, so the sparse index indexed them all and the second workspace ever
    // created died on `E11000 ... customDomain: null`. Found by signing up a second account.
    customDomain: { type: String, default: null, lowercase: true, trim: true },
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
    // This is only the FLAG; the encrypted key envelope itself lives in `aiKey` below.
    // Default false = use the platform's shared AI key + normal per-plan metering.
    aiByoKey: { type: Boolean, default: false },
    // Encrypted-at-rest BYO AI key (D5, TODO §14): the `{ provider, keyEnc }` envelope built
    // by lib/billing/byoKey (keyEnc is a lib/tenancy/secretCrypto AES-256-GCM ciphertext).
    // Written ONLY by lib/billing/byoKeyStore, which keeps `aiByoKey` above in lockstep (true
    // when a key is set, false when cleared). Null = no tenant key → platform key + normal
    // metering. The plaintext is never stored or logged; decryption happens on-demand in
    // memory at the AI dispatch site. Optional + null-default ⇒ fully backward-compatible.
    aiKey: {
      type: new Schema(
        { provider: { type: String }, keyEnc: { type: String } },
        { _id: false }
      ),
      default: null,
    },
    // GDPR Art. 17 (right-to-erasure) scheduled-deletion markers (D-erasure). An owner requests
    // erasure → these are stamped; a purge job later drops the tenant's data database once
    // `erasureScheduledAt` passes (the destructive drop is a separate, manual/gated flow — NEVER
    // an automated routine). The request is REVERSIBLE any time before `erasureScheduledAt` by
    // clearing them again. Kept ORTHOGONAL to `status`: erasure is a scheduled purge, not an
    // access flip, so an owner can keep using the workspace (and change their mind) during the
    // grace window without a prior-status-restoration dance. Written ONLY by lib/tenancy/erasure.
    // All null-default ⇒ fully backward-compatible; self-hosted never creates Tenant docs.
    erasureRequestedAt: { type: Date, default: null },
    erasureScheduledAt: { type: Date, default: null, index: true },
    // Account id of the owner who requested erasure (audit-adjacent; display/pointer only).
    erasureRequestedBy: { type: String, default: null },
  },
  { timestamps: true }
);

// Unique custom domain, but ONLY across tenants that actually have one. A partial index is used
// instead of `sparse: true` because sparse keys on "field absent" while this field is always
// present (default null) — so sparse would enforce global uniqueness of null and allow exactly
// ONE tenant to exist in the whole platform.
//
// NOTE for any database that already ran the old schema: Mongoose will not rewrite an existing
// index, so the broken `customDomain_1` must be dropped once
// (`db.tenants.dropIndex('customDomain_1')`) before this one can be built.
TenantSchema.index(
  { customDomain: 1 },
  { unique: true, partialFilterExpression: { customDomain: { $type: 'string' } } }
);

export type TenantDoc = InferSchemaType<typeof TenantSchema> & { _id: string };

export const Tenant: Model<TenantDoc> =
  (models.Tenant as Model<TenantDoc>) || model<TenantDoc>('Tenant', TenantSchema);
