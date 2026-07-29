import { NextRequest, NextResponse } from 'next/server';
import { withAuth, apiError } from '@/lib/apiAuth';
import { canAdmin } from '@/lib/roles';
import { runNtfyTest } from '@/lib/notify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/v1/settings/test-notify → send a one-off test to the configured ntfy topic.
 *
 *  Admin-only, matching the web Settings → Notifications action. The guard is `canAdmin` on
 *  the Bearer user rather than a call into the `sendTestNtfy` server action: that action
 *  gates with `requireAdmin()`, which resolves the **cookie session**, and a Bearer request
 *  from the phone carries no cookie — so going through the action made this endpoint fail
 *  for everyone (a redirect thrown out of a route handler), not just for non-admins. Both
 *  callers now share `runNtfyTest` and each applies the guard its own transport can judge.
 *
 *  Unlike PATCH /settings, there is nothing else in this request to preserve, so a
 *  non-admin gets a plain 403 instead of a silent no-op. */
export async function POST(req: NextRequest) {
  return withAuth(req, async (user) => {
    if (!canAdmin(user.role)) return apiError('Admin only', 403);
    const r = await runNtfyTest();
    if (!r.ok) return apiError(r.error || 'Notification failed', 400);
    return NextResponse.json({ ok: true });
  });
}
