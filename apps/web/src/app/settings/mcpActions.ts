'use server';
import { connectDB } from '@/lib/db';
import { User } from '@/models/User';
import { getCurrentUser } from '@/lib/auth';
import { randomBytes } from 'node:crypto';

export type McpStatus = { hasToken: boolean };

/** Whether the signed-in user has an MCP API token (never returns the token itself). */
export async function getMcpStatus(): Promise<McpStatus> {
  const u = await getCurrentUser();
  if (!u) return { hasToken: false };
  await connectDB();
  const doc = await User.findById(u.id).select('apiToken').lean();
  return { hasToken: !!doc?.apiToken };
}

/** Generate (or rotate) the signed-in user's MCP bearer token. Returned ONCE — it is
 *  never readable again, so the UI must copy it now. */
export async function generateApiToken(): Promise<{ ok: boolean; token?: string; error?: string }> {
  const u = await getCurrentUser();
  if (!u) return { ok: false, error: 'Not signed in' };
  await connectDB();
  const token = `phk_${randomBytes(24).toString('base64url')}`;
  await User.updateOne({ _id: u.id }, { $set: { apiToken: token } });
  return { ok: true, token };
}

/** Revoke the signed-in user's MCP token (the connector stops working immediately). */
export async function revokeApiToken(): Promise<{ ok: boolean }> {
  const u = await getCurrentUser();
  if (!u) return { ok: false };
  await connectDB();
  await User.updateOne({ _id: u.id }, { $set: { apiToken: null } });
  return { ok: true };
}
