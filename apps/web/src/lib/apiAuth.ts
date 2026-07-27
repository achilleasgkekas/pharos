import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { User } from '@/models/User';
import { rateHit, rateLimitConfig, rateStore } from '@/lib/apiRateLimit';
import { canWrite, isReadMethod, READ_ONLY_MESSAGE, type Role } from '@/lib/roles';

export type ApiUser = { id: string; name: string; username: string; role: Role };

/** Apply the (optional, env-gated) rate limit for `key`. Returns a 429 response when
 *  the limit is tripped (with `Retry-After` + `X-RateLimit-*` headers), else null. */
export function rateLimit(key: string): NextResponse | null {
  const cfg = rateLimitConfig();
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
 *  is the per-user `apiToken` (generated at first login or in Settings → Mobile/MCP). */
export async function bearerUser(req: NextRequest): Promise<ApiUser | null> {
  const m = (req.headers.get('authorization') || '').match(/^Bearer\s+(.+)$/i);
  const token = m?.[1]?.trim();
  if (!token) return null;
  await connectDB();
  const u = (await User.findOne({ apiToken: token }).select('_id name username role').lean()) as
    | { _id: unknown; name?: string; username: string; role: Role }
    | null;
  if (!u) return null;
  return { id: String(u._id), name: u.name || u.username, username: u.username, role: u.role };
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
 *  that is not a known safe verb counts as a mutation. */
export async function withAuth(
  req: NextRequest,
  fn: (user: ApiUser) => Promise<NextResponse>
): Promise<NextResponse> {
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
}
