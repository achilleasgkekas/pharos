'use server';
import { connectDB } from '@/lib/db';
import { User } from '@/models/User';
import { getCurrentUser } from '@/lib/auth';
import { randomBytes } from 'node:crypto';

// The calendar feed token is a LOW-SCOPE, read-only secret: it only exposes the
// 3-month money agenda over /api/calendar.ics. Unlike the MCP bearer token it is
// re-readable here (same model as a Google "secret address in iCal format") so the
// subscribe URL can be shown and copied at any time.

/** Current user's calendar feed token, or null if none has been generated. */
export async function getCalendarFeed(): Promise<{ token: string | null }> {
  const u = await getCurrentUser();
  if (!u) return { token: null };
  await connectDB();
  const doc = await User.findById(u.id).select('calendarToken').lean();
  return { token: doc?.calendarToken || null };
}

/** Generate (or rotate) the current user's calendar feed token. Rotating invalidates
 *  any previously-subscribed URL. */
export async function generateCalendarFeed(): Promise<{ ok: boolean; token?: string; error?: string }> {
  const u = await getCurrentUser();
  if (!u) return { ok: false, error: 'Not signed in' };
  await connectDB();
  const token = `phcal_${randomBytes(24).toString('base64url')}`;
  await User.updateOne({ _id: u.id }, { $set: { calendarToken: token } });
  return { ok: true, token };
}

/** Revoke the current user's calendar feed token (subscribed URLs stop working). */
export async function revokeCalendarFeed(): Promise<{ ok: boolean }> {
  const u = await getCurrentUser();
  if (!u) return { ok: false };
  await connectDB();
  await User.updateOne({ _id: u.id }, { $set: { calendarToken: null } });
  return { ok: true };
}
