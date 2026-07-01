import { NextRequest, NextResponse } from 'next/server';
import { withAuth, apiError } from '@/lib/apiAuth';
import { readBody } from '@/lib/apiBody';
import { suggestSubscriptionInfo } from '@/app/subscriptions/actions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/v1/ai/subscription  { name } → { data: { provider, amount, billingCycle, category, … } }
 *  AI-fills subscription details from a known name (Netflix, Spotify…). Needs the 'subscriptions' AI feature. */
export async function POST(req: NextRequest) {
  return withAuth(req, async () => {
    const b = await readBody(req);
    const name = String(b.name || '').trim();
    if (!name) return apiError('name required');
    const r = await suggestSubscriptionInfo(name);
    if (!r.ok) return apiError(r.error, 400);
    return NextResponse.json({ data: r.data });
  });
}
