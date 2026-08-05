import { Schema, model, models, type Model, type InferSchemaType } from 'mongoose';

/**
 * Login account. The app is a SHARED hub: every user sees the same data — there
 * is no per-user data isolation. Roles gate system administration only:
 *   - admin:  manage users + change system settings (AI, storage, network…)
 *   - member: full use of the app, but can't change users/system settings.
 * The first account is created by the first-run /setup wizard as an admin.
 */
const UserSchema = new Schema(
  {
    username: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, default: '' }, // display name
    passwordHash: { type: String, required: true }, // scrypt string — NEVER sent to the client
    role: { type: String, enum: ['admin', 'member', 'viewer'], default: 'member' },
    // Personal API token (bearer) for the remote MCP endpoint. Null = no token.
    // NEVER sent to the client except once, right after generation.
    apiToken: { type: String, default: null, index: true },
    // Read-only calendar feed secret (iCal .ics subscription URL). Low scope — it
    // only exposes the 3-month money agenda, so unlike apiToken it IS re-readable in
    // Settings (same model as a Google "secret address in iCal format"). Null = off.
    calendarToken: { type: String, default: null, index: true },
    // TOTP/MFA (P79), opt-in — same shape as the SaaS `Account` fields (lib/tenancy/mfaStore.ts),
    // reused via lib/userMfaStore.ts. mfaSecretEnc/mfaPendingSecretEnc are AES-256-GCM envelopes
    // (lib/tenancy/secretCrypto.ts) — the plaintext secret never persists. mfaRecoveryHashes are
    // scrypt hashes (lib/tenancy/recoveryCodes.ts), one spliced out per use. Empty/false = today's
    // password-only login, unchanged.
    mfaEnabled: { type: Boolean, default: false },
    mfaSecretEnc: { type: String, default: null },
    mfaPendingSecretEnc: { type: String, default: null },
    mfaRecoveryHashes: { type: [String], default: [] },
  },
  { timestamps: true }
);

export type UserDoc = InferSchemaType<typeof UserSchema> & { _id: string };

export const User: Model<UserDoc> =
  (models.User as Model<UserDoc>) || model<UserDoc>('User', UserSchema);
