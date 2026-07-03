import { Schema, model, models, type Model, type InferSchemaType } from 'mongoose';

/**
 * SaaS CONTROL-PLANE model — the per-tenant usage ledger. Lives in the central registry
 * database (the default MONGO_URI connection), NOT in a tenant's own data database. Only
 * meaningful when SAAS_MODE is on; the self-hosted single-user app never writes Usage docs
 * (it runs as the implicit DEFAULT_TENANT with unlimited quotas — see entitlements.ts).
 *
 * One document per (tenant, period) where `period` is the billing month "YYYY-MM". It
 * accumulates the metered quantities the plan caps:
 *   - aiCalls:       number of AI operations this month (metered by VOLUME, per plan).
 *   - aiInputTokens / aiOutputTokens: running token totals this month (TODO §11 — the
 *                    cost basis: plan caps by call VOLUME, but tokens/cost drive the real
 *                    platform spend and any future token-based plan tiers).
 *   - aiCostMicros:  running estimated AI spend this month in currency micros (millionths
 *                    of one unit, integer → no float drift). A best-effort estimate from
 *                    token totals × a rate; the source of truth for real billing stays Stripe.
 *   - storageBytes:  latest snapshot of the tenant's data-db + files footprint (a gauge,
 *                    overwritten by #10 dbStats metering — NOT a running sum).
 *
 * Kept deliberately small (a ledger, not an event log). Per-call detail lines can land in a
 * separate append-only collection later without touching this rollup.
 */
const UsageSchema = new Schema(
  {
    tenant: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    // Billing month "YYYY-MM" (UTC). One ledger row per tenant per month.
    period: { type: String, required: true },
    // Monotonic within a month: number of AI calls consumed. Reset happens implicitly by
    // moving to a new period document, so history stays queryable.
    aiCalls: { type: Number, default: 0 },
    // Running token totals this month (monotonic, like aiCalls). Cost basis for TODO §11.
    aiInputTokens: { type: Number, default: 0 },
    aiOutputTokens: { type: Number, default: 0 },
    // Running estimated AI spend this month, in currency micros (integer, no float drift).
    aiCostMicros: { type: Number, default: 0 },
    // Latest storage footprint snapshot in bytes (gauge, not additive).
    storageBytes: { type: Number, default: 0 },
    // When storageBytes was last refreshed (dbStats sampling).
    storageMeasuredAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// One ledger row per (tenant, period). Upserts key on this pair.
UsageSchema.index({ tenant: 1, period: 1 }, { unique: true });

export type UsageDoc = InferSchemaType<typeof UsageSchema> & { _id: string };

export const Usage: Model<UsageDoc> =
  (models.Usage as Model<UsageDoc>) || model<UsageDoc>('Usage', UsageSchema);
