// EDGE-SAFE half of the SaaS account session: the cookie NAME and token verification,
// and nothing else.
//
// lib/tenancy/accountSession.ts imports `next/headers` for its cookie read/write helpers,
// which makes the whole module node-only — its own header says "never from middleware".
// The middleware nonetheless has to answer "is anyone signed in?" at the edge, so the two
// pure, jose-only pieces live here and accountSession re-exports them. One implementation,
// two runtimes; no second copy of the verification to drift.
import { jwtVerify } from 'jose';

/** Distinct from the self-hosted `pharos_session` so both can coexist in one browser. */
export const ACCOUNT_COOKIE = 'pharos_account';

export type AccountClaims = { sub: string; email: string; exp?: number };

function getSecret(): Uint8Array | null {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) return null; // fail closed without a real secret
  return new TextEncoder().encode(s);
}

/** True when AUTH_SECRET is configured — lets SaaS routes fail closed with a clear 500. */
export function accountAuthConfigured(): boolean {
  return getSecret() !== null;
}

/** Verify an account token → claims, or null on any failure. Never throws. */
export async function verifyAccountToken(token: string | undefined | null): Promise<AccountClaims | null> {
  if (!token) return null;
  const secret = getSecret();
  if (!secret) return null;
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: ['HS256'] });
    const sub = typeof payload.sub === 'string' ? payload.sub : '';
    if (!sub) return null;
    const email = typeof payload.email === 'string' ? payload.email : '';
    return { sub, email, exp: typeof payload.exp === 'number' ? payload.exp : undefined };
  } catch {
    return null;
  }
}
