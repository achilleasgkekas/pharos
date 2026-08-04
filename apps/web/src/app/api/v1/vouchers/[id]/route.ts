import { NextRequest, NextResponse } from 'next/server';
import { withAuth, apiError } from '@/lib/apiAuth';
import { isObjectId, readBody } from '@/lib/apiBody';
import { connectDB } from '@/lib/db';
import { Voucher as VoucherModel } from '@/models/Voucher';
import { currentModel } from '@/lib/tenancy/connection';
import { trim, type VoucherLean } from '../route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** PATCH /api/v1/vouchers/:id  { title?, code?, store?, discount?, url?, expiresAt?, used? } */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(req, async () => {
    const { id } = await params;
    if (!isObjectId(id)) return apiError('bad id');
    const b = await readBody(req);
    const set: Record<string, unknown> = {};
    if (typeof b.title === 'string' && b.title.trim()) set.title = b.title.trim();
    if (typeof b.code === 'string') set.code = b.code.trim();
    if (typeof b.store === 'string') set.store = b.store.trim();
    if (typeof b.discount === 'string') set.discount = b.discount.trim();
    if (typeof b.url === 'string') set.url = b.url.trim();
    if (typeof b.used === 'boolean') set.used = b.used;
    if ('expiresAt' in b) { const d = b.expiresAt ? new Date(String(b.expiresAt)) : null; set.expiresAt = d && !Number.isNaN(d.getTime()) ? d : null; }
    if (!Object.keys(set).length) return apiError('no valid fields');
    await connectDB();
    const Voucher = await currentModel(VoucherModel);
    const doc = await Voucher.findByIdAndUpdate(id, { $set: set }, { new: true }).lean();
    if (!doc) return apiError('not found', 404);
    // Spec: PATCH returns { voucher: Voucher } (the updated doc), same trim as the list route.
    return NextResponse.json({ voucher: trim(doc as VoucherLean) });
  });
}

/** DELETE /api/v1/vouchers/:id → soft-delete (recoverable from Trash). */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(req, async () => {
    const { id } = await params;
    if (!isObjectId(id)) return apiError('bad id');
    await connectDB();
    const Voucher = await currentModel(VoucherModel);
    const doc = await Voucher.findByIdAndUpdate(id, { $set: { deletedAt: new Date() } }, { new: true }).lean();
    if (!doc) return apiError('not found', 404);
    return NextResponse.json({ ok: true, id });
  });
}
