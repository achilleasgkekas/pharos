import { NextRequest, NextResponse } from 'next/server';
import { withAuth, apiError } from '@/lib/apiAuth';
import { readBody } from '@/lib/apiBody';
import { connectDB } from '@/lib/db';
import { User } from '@/models/User';
import { isExpoPushToken } from '@/lib/expoPush';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/v1/push/register { token } → store an Expo push token on the current user. */
export async function POST(req: NextRequest) {
  return withAuth(req, async (user) => {
    const { token } = await readBody(req);
    if (!isExpoPushToken(token)) return apiError('valid Expo push token required');
    await connectDB();
    await User.updateOne({ _id: user.id }, { $addToSet: { pushTokens: token.trim() } });
    return NextResponse.json({ ok: true });
  });
}

/** DELETE /api/v1/push/register { token } → remove a token (e.g. on sign-out). */
export async function DELETE(req: NextRequest) {
  return withAuth(req, async (user) => {
    const { token } = await readBody(req);
    if (typeof token !== 'string' || !token.trim()) return apiError('token required');
    await connectDB();
    await User.updateOne({ _id: user.id }, { $pull: { pushTokens: token.trim() } });
    return NextResponse.json({ ok: true });
  });
}
