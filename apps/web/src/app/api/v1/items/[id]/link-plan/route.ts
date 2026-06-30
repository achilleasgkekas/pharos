import { NextRequest, NextResponse } from 'next/server';
import { withAuth, apiError } from '@/lib/apiAuth';
import { linkPlanToItem, removeItemFromPlanByKey } from '@/app/statements/actions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/v1/items/:id/link-plan  { signature } → attach this item to an
 *  installment plan (additive; one plan can carry several products). Wraps the
 *  proven web `linkPlanToItem` action. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(req, async () => {
    const { id } = await params;
    if (!/^[a-f0-9]{24}$/i.test(id)) return apiError('bad id');
    const b = (await req.json().catch(() => ({}))) as { signature?: unknown };
    const signature = typeof b.signature === 'string' ? b.signature.trim() : '';
    if (!signature) return apiError('signature required');
    const r = await linkPlanToItem(signature, id);
    return NextResponse.json({ ok: r.ok, linked: r.linked });
  });
}

/** DELETE /api/v1/items/:id/link-plan  { signature } → detach this item from the
 *  plan, keeping any other products on it. Wraps `removeItemFromPlanByKey`. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(req, async () => {
    const { id } = await params;
    if (!/^[a-f0-9]{24}$/i.test(id)) return apiError('bad id');
    const b = (await req.json().catch(() => ({}))) as { signature?: unknown };
    const signature = typeof b.signature === 'string' ? b.signature.trim() : '';
    if (!signature) return apiError('signature required');
    const r = await removeItemFromPlanByKey(signature, id);
    return NextResponse.json({ ok: r.ok });
  });
}
