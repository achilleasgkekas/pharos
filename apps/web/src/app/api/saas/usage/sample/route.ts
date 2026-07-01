import { NextResponse } from 'next/server';
import { saasMode } from '@/lib/tenancy/saasMode';
import { sampleAllTenants } from '@/lib/billing/dbStats';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/saas/usage/sample
 *
 * Scheduler-driven storage sampling: measures every live tenant's Mongo footprint and
 * writes the billed bytes into the Usage ledger for the current period, so the storage
 * quota has fresh figures to check against.
 *
 * SaaS-mode only (404 when SAAS_MODE off — the endpoint doesn't exist for the self-hosted
 * app). Protected by a shared CRON_SECRET bearer token (fail-closed 500 if unset) rather
 * than an account session, since a cron job — not a user — calls it. Read-only on the data
 * plane; the only writes are to the control-plane Usage collection.
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
  if (!token || token !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const result = await sampleAllTenants();
  return NextResponse.json({ ok: true, ...result });
}
