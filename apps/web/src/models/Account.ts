import { Schema, model, models, type Model, type InferSchemaType } from 'mongoose';

/**
 * SaaS CONTROL-PLANE model — lives in the central registry database. Only meaningful
 * when SAAS_MODE is on; the self-hosted single-user app uses `User` instead.
 *
 * An Account is a GLOBAL login identity (one person), independent of any tenant. It
 * links to one or more tenants via `Membership`. This is deliberately separate from
 * the per-tenant `User` model (which stays the isolation-free, shared-hub login of the
 * self-hosted app) so the two auth paths never entangle.
 *
 * `passwordHash` reuses the exact scrypt string format produced by lib/auth.ts
 * (`scrypt$N$r$p$salt$hash`) so hashing/verification stays a single node:crypto
 * implementation with no native dependency.
 */
const AccountSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, default: '' },
    passwordHash: { type: String, required: true }, // scrypt string — NEVER sent to the client
    emailVerified: { type: Boolean, default: false },
    // Short-lived tokens for email verification / password reset. Hashed value + expiry;
    // cleared on use. Null when none outstanding.
    verifyTokenHash: { type: String, default: null },
    verifyTokenExpires: { type: Date, default: null },
    resetTokenHash: { type: String, default: null },
    resetTokenExpires: { type: Date, default: null },
    lastLoginAt: { type: Date, default: null },
    // MFA (TOTP + recovery codes, TODO §9). `mfaSecretEnc` is only set once enrollment is
    // CONFIRMED (first code verified); `mfaPendingSecretEnc` holds a not-yet-confirmed secret
    // during enrollment so a half-finished setup can never silently enable MFA. Both are
    // secretCrypto (AES-256-GCM) envelopes, same idiom as the tenant BYO AI key — plaintext
    // never touches this document. `mfaRecoveryHashes` are scrypt hashes (lib/auth.ts), one
    // consumed (spliced out) per use. See lib/tenancy/mfaStore.ts for the read/write API.
    mfaEnabled: { type: Boolean, default: false },
    mfaSecretEnc: { type: String, default: null },
    mfaPendingSecretEnc: { type: String, default: null },
    mfaRecoveryHashes: { type: [String], default: [] },
    // "Sign out everywhere" epoch (P182). Embedded in session JWT and compared on read.
    sessionEpoch: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// The verify/reset confirm routes look an account up by its hashed token
// (`findOne({ verifyTokenHash })` / `{ resetTokenHash }`). Without an index those are
// full-collection scans. Sparse so accounts with no outstanding token stay out of the
// index footprint. Not unique: multiple accounts legitimately share the null default.
AccountSchema.index({ verifyTokenHash: 1 }, { sparse: true });
AccountSchema.index({ resetTokenHash: 1 }, { sparse: true });

export type AccountDoc = InferSchemaType<typeof AccountSchema> & { _id: string };

export const Account: Model<AccountDoc> =
  (models.Account as Model<AccountDoc>) || model<AccountDoc>('Account', AccountSchema);
