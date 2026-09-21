import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { User as UserModel } from '@/models/User';
import { rateHit, rateLimitConfig, rateStore, type RateConfig } from '@/lib/apiRateLimit';
import { canWrite, isReadMethod, READ_ONLY_MESSAGE, type Role } from '@/lib/roles';
import { DEFAULT_TENANT, type TenantContext } from '@/lib/tenancy/context';
import { currentModel } from '@/lib/tenancy/connection';
import { withTenant } from '@/lib/tenancy/current';

export type ApiUser = { id: string; name: string; username: string; role: Role };

/** Apply the (optional, env-gated) rate limit for `key`. Returns a 429 response when
 *  the limit is tripped (with `Retry-After` + `X-RateLimit-*` headers), else null.
 *
 *  `cfg` defaults to the general `/api/v1` budget. Pass an explicit config for a route that
 *  needs its own, e.g. `activationRateConfig()` for the paywall, where the general
 *  30-per-minute is far too much rope for a guessable code. */
export function rateLimit(key: string, cfg: RateConfig = rateLimitConfig()): NextResponse | null {
  if (!cfg.enabled) return null;
  const res = rateHit(rateStore, key, Date.now(), cfg.limit, cfg.windowMs);
  const reset = Math.ceil(res.resetAt / 1000);
  if (res.allowed) return null;
  const r = apiError('Rate limit exceeded — slow down and retry later', 429);
  r.headers.set('Retry-After', String(res.retryAfterSec));
  r.headers.set('X-RateLimit-Limit', String(res.limit));
  r.headers.set('X-RateLimit-Remaining', '0');
  r.headers.set('X-RateLimit-Reset', String(reset));
  return r;
}

/** Best-effort client IP for keying an IP-based rate limit (proxy headers → 'unknown'). */
export function clientIp(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip') || 'unknown';
}

/** Resolve the Bearer-token user, or null. Shared by every /api/v1 route. The token
 *  is the per-user `apiToken` (generated at first login or in Settings → API/MCP).
 *
 *  Runs inside the ambient tenant established by `withAuth`, so the lookup hits THAT
 *  workspace's `users` collection. Self-hosted (no ambient tenant) resolves to the default
 *  connection and behaves exactly as before. */
export async function bearerUser(req: NextRequest): Promise<ApiUser | null> {
  const m = (req.headers.get('authorization') || '').match(/^Bearer\s+(.+)$/i);
  const token = m?.[1]?.trim();
  if (!token) return null;
  await connectDB();
  const User = await currentModel(UserModel);
  const u = (await User.findOne({ apiToken: token }).select('_id name username role').lean()) as
    | { _id: unknown; name?: string; username: string; role: Role }
    | null;
  if (!u) return null;
  return { id: String(u._id), name: u.name || u.username, username: u.username, role: u.role };
}

/** A workspace the request may not enter, rendered as the response the caller gets. */
export type TenantGateFailure = { status: 404 | 403; error: string };

/** Compatibility accessor for bearer routes: the host never chooses a database. */
export async function apiTenant(): Promise<TenantContext | TenantGateFailure> {
  return DEFAULT_TENANT;
}

export function apiError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

/** Wrap a route handler with bearer auth: 401 without a valid token, 403 when a
 *  read-only user tries to change something, a clean 500 on a thrown error, else the
 *  handler runs with the resolved user.
 *
 *  The read-only check lives HERE rather than in each route because this wrapper is the
 *  single door into /api/v1: a new endpoint is protected the moment it is written, and
 *  there is no per-route line for anyone to forget. It keys off the HTTP method, which
 *  every route already uses honestly (GET reads, POST/PATCH/DELETE write), and anything
 *  that is not a known safe verb counts as a mutation.
 *
 *  TENANCY: for the same reason, the workspace is established HERE and the whole handler runs
 *  inside it, so no route can forget to scope itself. Note the ordering — the tenant must be
 *  resolved BEFORE the token is looked up, because which database holds the `users` collection
 *  is precisely what the tenant decides. Establishing context after auth would authenticate
 *  against the shared default database, which is the bug this replaces. */
export async function withAuth(
  req: NextRequest,
  fn: (user: ApiUser) => Promise<NextResponse>
): Promise<NextResponse> {
  const tenant = await apiTenant();
  if ('error' in tenant) return apiError(tenant.error, tenant.status);
  return withTenant(tenant, async () => {
    const user = await bearerUser(req);
    if (!user) return apiError('Unauthorized — send Authorization: Bearer <token>', 401);
    if (!isReadMethod(req.method) && !canWrite(user.role)) return apiError(READ_ONLY_MESSAGE, 403);
    const limited = rateLimit(`u:${user.id}`);
    if (limited) return limited;
    try {
      return await fn(user);
    } catch (e) {
      return apiError((e as Error).message?.slice(0, 200) || 'Server error', 500);
    }
  });
}
