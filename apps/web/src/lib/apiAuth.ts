import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { User } from '@/models/User';

export type ApiUser = { id: string; name: string; username: string; role: 'admin' | 'member' };

/** Resolve the Bearer-token user, or null. Shared by every /api/v1 route. The token
 *  is the per-user `apiToken` (generated at first login or in Settings → Mobile/MCP). */
export async function bearerUser(req: NextRequest): Promise<ApiUser | null> {
  const m = (req.headers.get('authorization') || '').match(/^Bearer\s+(.+)$/i);
  const token = m?.[1]?.trim();
  if (!token) return null;
  await connectDB();
  const u = (await User.findOne({ apiToken: token }).select('_id name username role').lean()) as
    | { _id: unknown; name?: string; username: string; role: 'admin' | 'member' }
    | null;
  if (!u) return null;
  return { id: String(u._id), name: u.name || u.username, username: u.username, role: u.role };
}

export function apiError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

/** Wrap a route handler with bearer auth: 401 without a valid token, a clean 500 on
 *  a thrown error, else the handler runs with the resolved user. */
export async function withAuth(
  req: NextRequest,
  fn: (user: ApiUser) => Promise<NextResponse>
): Promise<NextResponse> {
  const user = await bearerUser(req);
  if (!user) return apiError('Unauthorized — send Authorization: Bearer <token>', 401);
  try {
    return await fn(user);
  } catch (e) {
    return apiError((e as Error).message?.slice(0, 200) || 'Server error', 500);
  }
}
