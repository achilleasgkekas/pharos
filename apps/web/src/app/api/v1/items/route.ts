import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/apiAuth';
import { connectDB } from '@/lib/db';
import { Item } from '@/models/Item';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ItemLean = {
  _id: unknown; num?: string; title: string; status?: string; category?: string;
  currentPrice?: number; purchasedPrice?: number | null; targetPrice?: number | null;
  specs?: string; warrantyUntil?: Date | string | null; tags?: string[]; photos?: string[];
};

function trim(i: ItemLean) {
  return {
    id: String(i._id),
    num: i.num ?? '',
    title: i.title,
    status: i.status ?? 'researching',
    category: i.category ?? '',
    currentPrice: i.currentPrice ?? 0,
    purchasedPrice: i.purchasedPrice ?? null,
    targetPrice: i.targetPrice ?? null,
    specs: i.specs ?? '',
    warrantyUntil: i.warrantyUntil ? new Date(i.warrantyUntil).toISOString() : null,
    tags: i.tags ?? [],
    photo: i.photos?.[0] ?? null, // serve via /api/files/<photo>
  };
}

const SHOPPING = ['researching', 'decided', 'ordered'];
const OWNED = ['received', 'installed'];

/** GET /api/v1/items?status=shopping|inventory|all → { items } */
export async function GET(req: NextRequest) {
  return withAuth(req, async () => {
    await connectDB();
    const view = new URL(req.url).searchParams.get('status') || 'all';
    const q = view === 'shopping' ? { status: { $in: SHOPPING } } : view === 'inventory' ? { status: { $in: OWNED } } : {};
    const docs = (await Item.find(q).sort({ updatedAt: -1 }).limit(500).lean()) as ItemLean[];
    return NextResponse.json({ items: docs.map(trim) });
  });
}

/** POST /api/v1/items  { title, status?, category?, currentPrice? } → { item } */
export async function POST(req: NextRequest) {
  return withAuth(req, async () => {
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const title = String(b.title || '').trim();
    if (!title) return NextResponse.json({ error: 'title required' }, { status: 400 });
    await connectDB();
    const doc = await Item.create({
      title,
      status: String(b.status || 'researching'),
      category: String(b.category || 'other'),
      currentPrice: typeof b.currentPrice === 'number' ? b.currentPrice : 0,
    });
    return NextResponse.json({ item: trim(doc.toObject() as ItemLean) }, { status: 201 });
  });
}
