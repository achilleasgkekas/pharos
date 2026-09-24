import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { connectDB } from '@/lib/db';
import { User as UserModel } from '@/models/User';
import { currentModel } from '@/lib/tenancy/connection';
import { verifyPasswordFor } from '@/lib/auth';
import { rateLimit, apiError, apiTenant, clientIp } from '@/lib/apiAuth';
import { withTenant } from '@/lib/tenancy/current';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/v1/auth/login  { username, password } → { token, user }
 *  The token is the user's bearer apiToken (created on first login); send it as
 *  `Authorization: Bearer <token>` on every other /api/v1 request.
 *
 *  This is the one /api/v1 route that cannot use `withAuth` — it is where the token comes
 *  FROM — and that is how it ended up as the only door with no workspace behind it (#210).
 *  `currentModel(User)` with no ambient tenant resolves to the DEFAULT connection, so on a
 *  hosted workspace's subdomain the credentials were checked against the registry database
 *  rather than that workspace's `users`: every hosted customer's API login failed, and any
 *  account that did live in the default database got a token minted on the wrong host.
 *
 *  So it establishes the tenant the same way `withAuth` does, from the HOST alone — the one
 *  rule that works before a credential exists. Self-hosted returns the default tenant with no
 *  extra work, exactly as before. */
export async function POST(req: NextRequest) {
  const limited = rateLimit(`login:${clientIp(req)}`);
  if (limited) return limited;

  const tenant = await apiTenant();
  if ('error' in tenant) return apiError(tenant.error, tenant.status);

  // Inline rather than a `login(req)` helper on purpose: `openapi.request.test.ts` detects spec
  // drift by scanning the EXPORTED handler's own body for the fields it reads, so moving the
  // body parsing into a helper makes this route look like it accepts nothing at all.
  return withTenant(tenant, async () => {
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
  const User = await currentModel(UserModel);
  const user = await User.findOne({ username }).select('_id name username role passwordHash apiToken');
  // `verifyPasswordFor` runs scrypt even when no account matched, so a wrong username and a
  // wrong password take the same time — see lib/auth.ts.
  // Computed BEFORE the `!user` test: `!user || verify(...)` would short-circuit and skip scrypt
  // for exactly the case this exists to cover.
  const passwordOk = verifyPasswordFor(password, user?.passwordHash);
  if (!user || !passwordOk) {
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
  });
}
