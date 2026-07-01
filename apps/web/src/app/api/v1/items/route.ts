import { NextRequest, NextResponse } from 'next/server';
import { withAuth, apiError } from '@/lib/apiAuth';
import { listParams, withSince, iso, listEnvelope } from '@/lib/apiList';
import { connectDB } from '@/lib/db';
import { Item, ITEM_STATUSES } from '@/models/Item';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ItemLean = {
  _id: unknown; num?: string; title: string; status?: string; category?: string;
  currentPrice?: number; purchasedPrice?: number | null; targetPrice?: number | null;
  specs?: string; warrantyUntil?: Date | string | null; tags?: string[]; photos?: string[];
  updatedAt?: Date; deletedAt?: Date | null;
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
    updatedAt: iso(i.updatedAt),
    deleted: !!i.deletedAt,
  };
}

const SHOPPING = ['researching', 'decided', 'ordered'];
const OWNED = ['received', 'installed'];

/** GET /api/v1/items?status=shopping|inventory|all&limit&offset&updatedSince → { data, total, limit, offset } */
export async function GET(req: NextRequest) {
  return withAuth(req, async () => {
    await connectDB();
    const p = listParams(req);
    const view = p.sp.get('status') || 'all';
    const base = view === 'shopping' ? { status: { $in: SHOPPING } } : view === 'inventory' ? { status: { $in: OWNED } } : {};
    const filter = withSince(base, p);
    const find = Item.find(filter).sort({ updatedAt: -1 }).skip(p.offset).limit(p.limit);
    const count = Item.countDocuments(filter);
    if (p.updatedSince) { find.setOptions({ withDeleted: true }); count.setOptions({ withDeleted: true }); }
    const [docs, total] = await Promise.all([find.lean() as Promise<ItemLean[]>, count]);
    // Use the shared list envelope ({ data, ... }) like every other v1 list endpoint.
    return NextResponse.json(listEnvelope(docs.map(trim), total, p));
  });
}

/** POST /api/v1/items  { title, status?, category?, currentPrice? } → { item } */
export async function POST(req: NextRequest) {
  return withAuth(req, async () => {
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const title = String(b.title || '').trim();
    if (!title) return apiError('title required');
    // Validate status against the shared whitelist (same list the PATCH route uses);
    // an unknown value falls back to 'researching' rather than being stored verbatim.
    const status = (ITEM_STATUSES as readonly string[]).includes(String(b.status)) ? String(b.status) : 'researching';
    await connectDB();
    const doc = await Item.create({
      title,
      status,
      // category stays a free string by design (relaxed enum → custom categories from Settings → Lists).
      category: String(b.category || 'other'),
      currentPrice: typeof b.currentPrice === 'number' ? b.currentPrice : 0,
    });
    return NextResponse.json({ item: trim(doc.toObject() as ItemLean) }, { status: 201 });
  });
}
