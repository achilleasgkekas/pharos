import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/apiAuth';
import { getConversations } from '@/app/history/actions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/v1/history → saved AI command-bar conversations, newest first.
 *  Read-only mirror of the web /history page. */
export async function GET(req: NextRequest) {
  return withAuth(req, async () => {
    const rows = await getConversations();
    return NextResponse.json({ rows });
  });
}
