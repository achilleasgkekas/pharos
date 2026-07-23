import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { saasMode } from '@/lib/tenancy/saasMode';
import { runErasurePurgeScan } from '@/lib/tenancy/erasurePurge';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Constant-time bearer-token compare. Length-guarded because timingSafeEqual throws on
 *  differing buffer lengths (same shape as trials/sweep and usage/sample). */
function tokenMatches(token: string, secret: string): boolean {
  const a = Buffer.from(token, 'utf8');
  const b = Buffer.from(secret, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * POST /api/saas/workspace/erasure/purge
 *
 * Scheduler-driven erasure-purge SCAN (GDPR Art. 17). Reports workspaces whose erasure grace
 * window has elapsed (`erasureScheduledAt <= now`) and are awaiting permanent deletion. This is
 * REPORT-ONLY: it never drops a database (`dryRun` is always true). The actual destructive drop
 * is a separate, manual/gated flow — never performed by an automated routine. A human reviews
 * the reported targets before any real deletion.
 *
 * SaaS-mode only (404 when SAAS_MODE off — it doesn't exist for the self-hosted app). Protected
 * by the shared CRON_SECRET bearer (fail-closed 500 if unset), not an account session, since a
 * scheduler — not a user — calls it. Reads only the control-plane Tenant collection; the data
 * plane is never touched.
 */
export async function POST(req: Request) {
  if (!saasMode()) {
    return NextResponse.json({ error: 'SaaS mode is not enabled' }, { status: 404 });
  }
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET is not configured' }, { status: 500 });
  }
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token || !tokenMatches(token, secret)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
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
