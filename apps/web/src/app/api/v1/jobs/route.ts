import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/apiAuth';
import { getJobs } from '@/app/jobActions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/v1/jobs → recent background AI jobs (running first, then newest).
 *  Same data the web /jobs page + floating widget poll. Read-only. */
export async function GET(req: NextRequest) {
  return withAuth(req, async () => {
    const rows = await getJobs();
    return NextResponse.json({ rows });
  });
}
