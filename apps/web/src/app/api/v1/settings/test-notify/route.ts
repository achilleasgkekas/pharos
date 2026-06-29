import { NextRequest, NextResponse } from 'next/server';
import { withAuth, apiError } from '@/lib/apiAuth';
import { sendTestNtfy } from '@/app/settings/actions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/v1/settings/test-notify → send a one-off test to the configured ntfy topic. */
export async function POST(req: NextRequest) {
  return withAuth(req, async () => {
    const r = await sendTestNtfy();
    if (!r.ok) return apiError(r.error || 'Notification failed', 400);
    return NextResponse.json({ ok: true });
  });
}
