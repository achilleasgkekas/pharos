import 'server-only';
import { connectDB } from '@/lib/db';
import { User as UserModel } from '@/models/User';
import { currentModel } from '@/lib/tenancy/connection';

/** P75 (#20): user id -> display name, for the "added by" line on records. */
export type AttributionNames = Record<string, string>;

/**
 * The names to show next to records, or null when attribution should stay invisible.
 *
 * Null on a single-user instance on purpose: "added by you" on every row of a one-person
 * install is clutter, and it is exactly the setup most people run. It turns on by itself the
 * day a second account is created. Fails closed (null) on a DB error: this only decorates
 * pages and must never break one.
 */
export async function loadAttributionNames(): Promise<AttributionNames | null> {
  try {
    await connectDB();
    const User = await currentModel(UserModel);
    const users = (await User.find().select('_id username name').lean()) as Array<{ _id: unknown; username?: string; name?: string }>;
    if (users.length < 2) return null;
    return Object.fromEntries(users.map((u) => [String(u._id), (u.name || '').trim() || u.username || '']));
  } catch {
    return null;
  }
}
