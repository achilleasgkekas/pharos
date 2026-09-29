import { connectDB } from './db';
import { User } from '@/models/User';
import { parseRole } from './roles';
import { verifySession, type SessionClaims } from './session';

/** Revalidate every session against current account state. Never cache across requests. */
export async function validateSessionToken(token: string | null | undefined): Promise<SessionClaims | null> {
  const claims = await verifySession(token);
  if (!claims || !Number.isSafeInteger(claims.epoch) || claims.epoch! < 0) return null;
  try {
    await connectDB();
    const user = await User.findById(claims.sub).select('sessionEpoch role name username').lean();
    if (!user || (user.sessionEpoch ?? 0) !== claims.epoch) return null;
    const role = parseRole(user.role);
    if (!role) return null;
    return { ...claims, role, name: user.name || user.username };
  } catch {
    return null;
  }
}
