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
    resetTokenHash: { type: String, default: null },
    resetTokenExpires: { type: Date, default: null },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export type AccountDoc = InferSchemaType<typeof AccountSchema> & { _id: string };

export const Account: Model<AccountDoc> =
  (models.Account as Model<AccountDoc>) || model<AccountDoc>('Account', AccountSchema);
