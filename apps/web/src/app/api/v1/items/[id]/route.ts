import { NextRequest, NextResponse } from 'next/server';
import { withAuth, apiError } from '@/lib/apiAuth';
import { iso } from '@/lib/apiList';
import { connectDB } from '@/lib/db';
import { Item } from '@/models/Item';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STATUS = ['researching', 'decided', 'ordered', 'received', 'installed', 'sold', 'broken', 'deferred'];

/** PATCH /api/v1/items/:id  { title?, status?, category?, currentPrice?, targetPrice?, specs?, tags? } */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(req, async () => {
    const { id } = await params;
    if (!/^[a-f0-9]{24}$/i.test(id)) return apiError('bad id');
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const set: Record<string, unknown> = {};
    if (typeof b.title === 'string' && b.title.trim()) set.title = b.title.trim();
    if (typeof b.status === 'string' && STATUS.includes(b.status)) set.status = b.status;
    if (typeof b.category === 'string') set.category = b.category;
    if (typeof b.specs === 'string') set.specs = b.specs;
    if (typeof b.currentPrice === 'number') set.currentPrice = b.currentPrice;
    if ('targetPrice' in b) set.targetPrice = b.targetPrice == null ? null : Number(b.targetPrice);
    if (Array.isArray(b.tags)) set.tags = b.tags.map(String);
    if (!Object.keys(set).length) return apiError('no valid fields');
    await connectDB();
    const doc = await Item.findByIdAndUpdate(id, { $set: set }, { new: true }).lean();
    if (!doc) return apiError('not found', 404);
    const i = doc as { _id: unknown; title: string; status?: string; category?: string; currentPrice?: number; targetPrice?: number | null; updatedAt?: Date };
    return NextResponse.json({
      item: { id: String(i._id), title: i.title, status: i.status ?? 'researching', category: i.category ?? '', currentPrice: i.currentPrice ?? 0, targetPrice: i.targetPrice ?? null, updatedAt: iso(i.updatedAt) },
    });
  });
}

/** DELETE /api/v1/items/:id  → soft-delete (recoverable from Trash). */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(req, async () => {
    const { id } = await params;
    if (!/^[a-f0-9]{24}$/i.test(id)) return apiError('bad id');
    await connectDB();
    const doc = await Item.findByIdAndUpdate(id, { $set: { deletedAt: new Date() } }, { new: true }).lean();
    if (!doc) return apiError('not found', 404);
    return NextResponse.json({ ok: true, id });
  });
}
