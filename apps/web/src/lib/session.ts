// Edge-safe session token helpers. ONLY depends on `jose` (Web Crypto) so this
// module can be imported by middleware (which runs on the Edge runtime where
// node:crypto and Mongoose are unavailable). No next/headers, no DB.
import { SignJWT, jwtVerify } from 'jose';

export type Role = 'admin' | 'member';
export type SessionClaims = { sub: string; role: Role; name: string };

// Cookie shared by middleware (read) + auth.ts (set/clear).
export const SESSION_COOKIE = 'pharos_session';
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days, in seconds

function getSecret(): Uint8Array | null {
  const s = process.env.AUTH_SECRET;
  // Fail closed: without a real secret we refuse to mint/accept sessions.
  if (!s || s.length < 16) return null;
  return new TextEncoder().encode(s);
}

/** True when AUTH_SECRET is configured. Lets callers fail closed with a clear message. */
export function authConfigured(): boolean {
  return getSecret() !== null;
}

export async function signSession(claims: SessionClaims): Promise<string> {
  const secret = getSecret();
  if (!secret) throw new Error('AUTH_SECRET is not set (min 16 chars)');
  return await new SignJWT({ role: claims.role, name: claims.name })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(secret);
}

/** Verify a token → claims, or null on any failure (missing secret, bad sig, expired). Never throws. */
export async function verifySession(token: string | undefined | null): Promise<SessionClaims | null> {
  if (!token) return null;
  const secret = getSecret();
  if (!secret) return null;
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: ['HS256'] });
    const sub = typeof payload.sub === 'string' ? payload.sub : '';
    if (!sub) return null;
    const role: Role = payload.role === 'admin' ? 'admin' : 'member';
    const name = typeof payload.name === 'string' ? payload.name : '';
    return { sub, role, name };
  } catch {
    return null;
  }
}
