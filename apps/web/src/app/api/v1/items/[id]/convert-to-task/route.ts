import { NextRequest, NextResponse } from 'next/server';
import { withAuth, apiError } from '@/lib/apiAuth';
import { isObjectId } from '@/lib/apiBody';
import { convertItemToTask } from '@/app/items/actions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/v1/items/:id/convert-to-task → create a Task seeded from this item
 *  (title, price, links rendered as HTML, tag 'shopping'). Wraps the proven web
 *  `convertItemToTask` action; the item itself is left untouched. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(req, async () => {
    const { id } = await params;
    if (!isObjectId(id)) return apiError('bad id');
    const r = await convertItemToTask(id);
    if (!r.ok) return apiError(r.error || 'convert failed', 404);
    return NextResponse.json({ ok: true, taskId: r.taskId });
  });
}
