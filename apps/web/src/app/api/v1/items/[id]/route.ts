import { NextRequest, NextResponse } from 'next/server';
import { withAuth, apiError } from '@/lib/apiAuth';
import { iso } from '@/lib/apiList';
import { connectDB } from '@/lib/db';
import { Item, ITEM_STATUSES } from '@/models/Item';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STATUS = ITEM_STATUSES as readonly string[];

function linkHost(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

type LinkLean = { label?: string; url: string; price?: number | null };
type HistLean = { _id?: unknown; price: number; store: string; date: Date | string };

/** Mirror of components/PricePanel.tsx priceStatus(): one coherent price picture
 *  (best-now, lowest/highest seen, trend, verdict, where-to-buy) computed server-side
 *  so the mobile detail view stays in sync with the web without re-implementing the logic. */
function priceStatus(item: { currentPrice: number; targetPrice?: number | null; links: LinkLean[]; priceHistory: HistLean[] }) {
  const stores = (item.links ?? [])
    .filter((l) => l.price && l.price > 0)
    .map((l) => ({ store: l.label || linkHost(l.url), url: l.url, price: l.price as number }))
    .sort((a, b) => a.price - b.price);

  let bestNow: { price: number; store: string; url: string | null } | null = stores[0]
    ? { price: stores[0].price, store: stores[0].store, url: stores[0].url }
    : null;
  if (!bestNow && item.currentPrice > 0) bestNow = { price: item.currentPrice, store: '', url: null };

  const hist = [...(item.priceHistory ?? [])].filter((h) => h.price > 0).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const prices = hist.map((h) => h.price);
  if (bestNow) prices.push(bestNow.price);
  const lo = prices.length ? Math.min(...prices) : null;
  const hi = prices.length ? Math.max(...prices) : null;
  const trend = hist.length >= 2 && hist[hist.length - 1].price !== hist[hist.length - 2].price ? hist[hist.length - 1].price - hist[hist.length - 2].price : 0;
  const target = item.targetPrice && item.targetPrice > 0 ? item.targetPrice : null;

  let verdict: 'deal' | 'dropping' | 'rising' | 'good' | 'high' | 'none' = 'none';
  if (bestNow && lo != null && hi != null) {
    const range = hi - lo || 1;
    const pos = (bestNow.price - lo) / range;
    if (target && bestNow.price <= target) verdict = 'deal';
    else if (trend < 0) verdict = 'dropping';
    else if (trend > 0) verdict = 'rising';
    else if (pos <= 0.15) verdict = 'good';
    else if (pos >= 0.7) verdict = 'high';
  }
  return { bestNow, lo, hi, target, trend, verdict, stores };
}

type ItemDetailLean = {
  _id: unknown; num?: string; title: string; status?: string; category?: string;
  currentPrice?: number; purchasedPrice?: number | null; targetPrice?: number | null;
  specs?: string; notes?: string; warrantyUntil?: Date | string | null;
  purchasedFrom?: string; purchasedAt?: Date | string | null; location?: string; serialNumber?: string;
  tags?: string[]; photos?: string[]; links?: LinkLean[]; priceHistory?: HistLean[]; updatedAt?: Date;
};

/** GET /api/v1/items/:id → full item detail (links, price history, photos, warranty, purchase)
 *  plus a computed `price` block (best-now / where-to-buy / verdict) for the mobile PricePanel. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(req, async () => {
    const { id } = await params;
    if (!/^[a-f0-9]{24}$/i.test(id)) return apiError('bad id');
    await connectDB();
    const doc = (await Item.findById(id).lean()) as ItemDetailLean | null;
    if (!doc) return apiError('not found', 404);
    const links = (doc.links ?? []).map((l) => ({ label: l.label ?? '', url: l.url, price: l.price ?? null }));
    const priceHistory = [...(doc.priceHistory ?? [])]
      .map((h) => ({ price: h.price, store: h.store, date: new Date(h.date).toISOString() }))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const price = priceStatus({ currentPrice: doc.currentPrice ?? 0, targetPrice: doc.targetPrice ?? null, links, priceHistory });
    return NextResponse.json({
      item: {
        id: String(doc._id),
        num: doc.num ?? '',
        title: doc.title,
        status: doc.status ?? 'researching',
        category: doc.category ?? '',
        currentPrice: doc.currentPrice ?? 0,
        purchasedPrice: doc.purchasedPrice ?? null,
        targetPrice: doc.targetPrice ?? null,
        specs: doc.specs ?? '',
        notes: doc.notes ?? '',
        warrantyUntil: doc.warrantyUntil ? new Date(doc.warrantyUntil).toISOString() : null,
        purchasedFrom: doc.purchasedFrom ?? '',
        purchasedAt: doc.purchasedAt ? new Date(doc.purchasedAt).toISOString() : null,
        location: doc.location ?? '',
        serialNumber: doc.serialNumber ?? '',
        tags: doc.tags ?? [],
        photos: doc.photos ?? [],
        photo: doc.photos?.[0] ?? null,
        links,
        priceHistory,
        price,
        updatedAt: iso(doc.updatedAt),
      },
    });
  });
}

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
