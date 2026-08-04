import { NextResponse } from 'next/server';
import { saasMode } from '@/lib/tenancy/saasMode';
import { checkCronAuth } from '@/lib/cronAuth';
import { runErasurePurgeScan } from '@/lib/tenancy/erasurePurge';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/cron/saas/erasure-purge   (moved from /api/saas/workspace/erasure/purge)
 *
 * Scheduler-driven erasure-purge SCAN (GDPR Art. 17). Reports workspaces whose erasure grace
 * window has elapsed (`erasureScheduledAt <= now`) and are awaiting permanent deletion. This is
 * REPORT-ONLY: it never drops a database (`dryRun` is always true). The actual destructive drop
 * is a separate, manual/gated flow — never performed by an automated routine. A human reviews
 * the reported targets before any real deletion.
 *
 * Moved alongside the other two scheduler endpoints: it carried the same third private copy of
 * the constant-time compare and sat behind the same session gate. See the note on usage-sample
 * for why /api/cron/ is the only prefix a CRON_SECRET-authenticated route should live under.
 * The session-based `/api/saas/workspace/erasure` (schedule/cancel an erasure) stays where it
 * is — that one IS called by a signed-in user.
 *
 * SaaS-mode only (404 when SAAS_MODE off — it doesn't exist for the self-hosted app).
 * Authenticated by the shared CRON_SECRET bearer via lib/cronAuth.ts (fail-closed 500 when
 * unset). Reads only the control-plane Tenant collection; the data plane is never touched.
 */
export async function POST(req: Request) {
  if (!saasMode()) {
    return NextResponse.json({ error: 'SaaS mode is not enabled' }, { status: 404 });
  }

  const fail = checkCronAuth(req);
  if (fail) {
    return NextResponse.json({ error: fail.error }, { status: fail.status });
  }

  try {
    const result = await runErasurePurgeScan();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message?.slice(0, 200) || 'Server error' },
      { status: 500 }
    );
  }
}
