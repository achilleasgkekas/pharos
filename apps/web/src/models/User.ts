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
    role: { type: String, enum: ['admin', 'member'], default: 'member' },
  },
  { timestamps: true }
);

export type UserDoc = InferSchemaType<typeof UserSchema> & { _id: string };

export const User: Model<UserDoc> =
  (models.User as Model<UserDoc>) || model<UserDoc>('User', UserSchema);
