import { NextRequest, NextResponse } from 'next/server';
import { withAuth, apiError } from '@/lib/apiAuth';
import { isObjectId } from '@/lib/apiBody';
import { restoreFromTrash, purgeTrashEntry, type TrashType } from '@/app/settings/actions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TYPES: TrashType[] = ['item', 'receipt', 'expense', 'subscription', 'voucher', 'giftcard', 'loyaltycard', 'bill', 'goal', 'task', 'conversation'];
const isType = (t: string): t is TrashType => (TYPES as string[]).includes(t);

/** PATCH /api/v1/trash/:type/:id → restore a soft-deleted record (clears deletedAt). */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ type: string; id: string }> }) {
  return withAuth(req, async () => {
    const { type, id } = await params;
    if (!isType(type)) return apiError('bad type');
    if (!isObjectId(id)) return apiError('bad id');
    const r = await restoreFromTrash(type, id);
    return NextResponse.json({ ok: r.ok, type, id });
  });
}

/** DELETE /api/v1/trash/:type/:id → permanently purge (doc + files + cross-refs). Admin only. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ type: string; id: string }> }) {
  return withAuth(req, async (user) => {
    if (user.role !== 'admin') return apiError('Admin access required', 403);
    const { type, id } = await params;
    if (!isType(type)) return apiError('bad type');
    if (!isObjectId(id)) return apiError('bad id');
    const r = await purgeTrashEntry(type, id);
    return NextResponse.json({ ok: r.ok, type, id });
  });
}
