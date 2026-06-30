import { NextRequest, NextResponse } from 'next/server';
import { withAuth, apiError } from '@/lib/apiAuth';
import { addReceiptItemsToLibrary } from '@/app/receipts/actions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/v1/receipts/:id/add-to-library
 *  Turn the receipt's line items into inventory Items (find-or-create by title,
 *  link the receipt). Wraps the proven addReceiptItemsToLibrary action.
 *  → { ok, created, linked }. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(req, async () => {
    const { id } = await params;
    if (!/^[a-f0-9]{24}$/i.test(id)) return apiError('bad id');
    const r = await addReceiptItemsToLibrary(id);
    if (!r.ok) return apiError(r.error || 'failed', 400);
    return NextResponse.json({ ok: true, created: r.created, linked: r.linked });
  });
}
