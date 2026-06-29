import { NextRequest, NextResponse } from 'next/server';
import { withAuth, apiError } from '@/lib/apiAuth';
import { connectDB } from '@/lib/db';
import { Expense } from '@/models/Expense';
import { vendorKey } from '@/app/expenses/lib';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** PATCH /api/v1/expenses/:id  { vendor?, amount?, category?, kind?, notes?, date? } */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(req, async () => {
    const { id } = await params;
    if (!/^[a-f0-9]{24}$/i.test(id)) return apiError('bad id');
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const set: Record<string, unknown> = {};
    if (typeof b.vendor === 'string' && b.vendor.trim()) { set.vendor = b.vendor.trim(); set.vendorKey = vendorKey(b.vendor.trim()); }
    if (b.amount != null && Number.isFinite(Number(b.amount))) set.amount = Number(b.amount);
    if (typeof b.category === 'string') set.category = b.category;
    if (b.kind === 'income' || b.kind === 'expense') set.kind = b.kind;
    if (typeof b.notes === 'string') set.notes = b.notes;
    if (b.date) { const d = new Date(String(b.date)); if (!Number.isNaN(d.getTime())) set.date = d; }
    if (!Object.keys(set).length) return apiError('no valid fields');
    await connectDB();
    const doc = await Expense.findByIdAndUpdate(id, { $set: set }, { new: true }).lean();
    if (!doc) return apiError('not found', 404);
    return NextResponse.json({ ok: true, id });
  });
}

/** DELETE /api/v1/expenses/:id → soft-delete (recoverable from Trash). */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(req, async () => {
    const { id } = await params;
    if (!/^[a-f0-9]{24}$/i.test(id)) return apiError('bad id');
    await connectDB();
    const doc = await Expense.findByIdAndUpdate(id, { $set: { deletedAt: new Date() } }, { new: true }).lean();
    if (!doc) return apiError('not found', 404);
    return NextResponse.json({ ok: true, id });
  });
}
