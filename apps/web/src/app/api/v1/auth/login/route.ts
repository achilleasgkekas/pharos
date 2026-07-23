import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { connectDB } from '@/lib/db';
import { User } from '@/models/User';
import { verifyPassword } from '@/lib/auth';
import { rateLimit, apiError, clientIp } from '@/lib/apiAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/v1/auth/login  { username, password } → { token, user }
 *  The token is the user's bearer apiToken (created on first login); send it as
 *  `Authorization: Bearer <token>` on every other /api/v1 request. */
export async function POST(req: NextRequest) {
  const limited = rateLimit(`login:${clientIp(req)}`);
  if (limited) return limited;

  let body: { username?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return apiError('Invalid JSON body');
  }
  const username = (body.username || '').trim().toLowerCase();
  const password = body.password || '';
  if (!username || !password) return apiError('username and password required');

  await connectDB();
  const user = await User.findOne({ username }).select('_id name username role passwordHash apiToken');
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return apiError('Invalid credentials', 401);
  }

  let token = user.apiToken;
  if (!token) {
    token = `phk_${randomBytes(24).toString('base64url')}`;
    user.apiToken = token;
    await user.save();
  }

  return NextResponse.json({
    token,
    user: { id: String(user._id), name: user.name || user.username, username: user.username, role: user.role },
  });
}
