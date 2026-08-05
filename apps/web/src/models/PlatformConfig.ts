import { Schema, model, models, type Model, type InferSchemaType } from 'mongoose';

/**
 * Fleet-wide operator settings — one document, in the CONTROL plane registry database.
 *
 * Distinct from AppConfig, which is per-tenant: this holds what the operator sets once for
 * everyone, starting with the platform AI key that every workspace without its own key runs
 * on. Deliberately a separate collection rather than a field on some tenant, because it
 * belongs to nobody's workspace and must not travel with a tenant export, erasure or backup.
 *
 * The key is stored ENCRYPTED (lib/tenancy/secretCrypto, same as the per-tenant BYO keys) and
 * the plaintext is only ever produced at the AI dispatch site.
 */
const PlatformConfigSchema = new Schema(
  {
    key: { type: String, default: 'singleton', unique: true, index: true },

    // { provider, keyEnc } — see lib/billing/byoKey.ts encodeAiKey/decodeAiKey. Mixed rather
    // than a sub-schema so the stored shape stays identical to the per-tenant one and both
    // can go through the same encode/decode pair.
    aiKey: { type: Schema.Types.Mixed, default: null },

    // Audit breadcrumbs for a secret nobody can read back: who last changed it and when.
    aiKeyUpdatedAt: { type: Date, default: null },
    aiKeyUpdatedBy: { type: String, default: '' },
  },
  { timestamps: true }
);

export type PlatformConfigDoc = InferSchemaType<typeof PlatformConfigSchema> & { _id: string };

export const PlatformConfig: Model<PlatformConfigDoc> =
  (models.PlatformConfig as Model<PlatformConfigDoc>) ||
  model<PlatformConfigDoc>('PlatformConfig', PlatformConfigSchema);
