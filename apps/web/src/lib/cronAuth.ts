import { timingSafeEqual } from 'node:crypto';

// Shared bearer-token gate for scheduler-driven endpoints (cron, not a logged-in user).
//
// The idiom was already used verbatim in three SaaS routes (usage/sample, trials/sweep,
// workspace/erasure/purge), each carrying its own private copy of the compare. This module is
// the single home for it so a fourth caller does not mean a fourth copy of a security-sensitive
// constant-time compare. The existing SaaS copies are left alone on purpose (they belong to the
// saas-core routine's territory); they can adopt this later with no behaviour change.

export type CronAuthFailure = { status: 401 | 500; error: string };

/**
 * Constant-time bearer-token compare. Length-guarded because timingSafeEqual THROWS on
 * differing buffer lengths, so a shorter/longer token must be rejected before the compare
 * rather than crashing the handler.
 */
export function cronTokenMatches(token: string, secret: string): boolean {
  const a = Buffer.from(token, 'utf8');
  const b = Buffer.from(secret, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Verify a request carries the shared CRON_SECRET as a bearer token.
 *
 * Returns `null` when the caller is authorised, otherwise the failure the route should render:
 *   - 500 when CRON_SECRET is unset — fail CLOSED, so a misconfigured deployment cannot expose
 *     the endpoint to anyone who simply omits the header,
 *   - 401 for a missing, malformed, or wrong token.
 *
 * The env var is read per call (not at module load) so a deployment that injects it late, and
 * tests that mutate process.env, both see the current value.
 */
export function checkCronAuth(req: Request): CronAuthFailure | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) return { status: 500, error: 'CRON_SECRET is not configured' };

  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token || !cronTokenMatches(token, secret)) return { status: 401, error: 'unauthorized' };

  return null;
}
