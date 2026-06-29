import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/apiAuth';
import { getTrash } from '@/app/settings/actions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/v1/trash → soft-deleted records (item/receipt/expense/subscription/voucher/task),
 *  most-recently-deleted first. Auto-purges entries older than 30 days as a side effect. */
export async function GET(req: NextRequest) {
  return withAuth(req, async () => {
    const rows = await getTrash();
    return NextResponse.json({ rows });
  });
}
