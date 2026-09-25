import { NextRequest, NextResponse } from 'next/server';
import { withAuth, apiError } from '@/lib/apiAuth';
import { isObjectId, readBody } from '@/lib/apiBody';
import { iso } from '@/lib/apiList';
import { connectDB } from '@/lib/db';
import { getAppSettings } from '@/lib/appSettings';
import { marketFor, isInMarket, type ShoppingMarket } from '@/lib/shoppingRegion';
import { resolveItemPrices, isForeignCurrency, toPrinted } from '@/lib/fx';
import { calculatePriceTrend } from '@/lib/priceTrend';
import { Item as ItemModel, ITEM_STATUSES } from '@/models/Item';
import { currentModel } from '@/lib/tenancy/connection';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STATUS = ITEM_STATUSES as readonly string[];

function linkHost(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

type LinkLean = { label?: string; url: string; price?: number | null };
type HistLean = { _id?: unknown; price: number; store: string; url?: string; date: Date | string };
type AttachmentLean = { path: string; name?: string; mimeType?: string; size?: number; uploadedAt?: Date | string };

/** Mirror of components/PricePanel.tsx priceStatus(): one coherent price picture
 *  (best-now, lowest/highest seen, trend, verdict, where-to-buy) computed server-side
 *  so API clients' detail views stay in sync with the web without re-implementing the logic. */
function priceStatus(item: { currentPrice: number; targetPrice?: number | null; links: LinkLean[]; priceHistory: HistLean[] }, market: ShoppingMarket | null) {
  const stores = (item.links ?? [])
    .filter((l) => l.price && l.price > 0)
    .map((l) => ({ store: l.label || linkHost(l.url), url: l.url, price: l.price as number }))
    .sort((a, b) => a.price - b.price);

  // Same shopping-market rule as the PricePanel (#319): headline and deal from in-market shops.
  const inMarket = stores.filter((st) => isInMarket(st.url, market));
  const best = inMarket[0] ?? stores[0];
  let bestNow: { price: number; store: string; url: string | null } | null = best ? { price: best.price, store: best.store, url: best.url } : null;
  if (!bestNow && item.currentPrice > 0) bestNow = { price: item.currentPrice, store: '', url: null };
  const dealEligible = inMarket.length > 0 || stores.length === 0;

  // In-market history only, as in the PricePanel (#319).
  const hist = [...(item.priceHistory ?? [])]
    .filter((h) => h.price > 0 && isInMarket(h.url, market))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const prices = hist.map((h) => h.price);
  if (bestNow) prices.push(bestNow.price);
  const lo = prices.length ? Math.min(...prices) : null;
  const hi = prices.length ? Math.max(...prices) : null;
  const rawTrend = calculatePriceTrend(hist, bestNow);
  const trend = rawTrend ?? 0;
  const target = item.targetPrice && item.targetPrice > 0 ? item.targetPrice : null;

  let verdict: 'deal' | 'dropping' | 'rising' | 'good' | 'high' | 'none' = 'none';
  if (bestNow && lo != null && hi != null) {
    const range = hi - lo || 1;
    const pos = (bestNow.price - lo) / range;
    if (target && dealEligible && bestNow.price <= target) verdict = 'deal';
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
  currency?: string; origAmount?: number; fxRate?: number;
  specs?: string; notes?: string; warrantyUntil?: Date | string | null;
  purchasedFrom?: string; purchasedAt?: Date | string | null; location?: string; serialNumber?: string;
  tags?: string[]; photos?: string[]; attachments?: AttachmentLean[]; links?: LinkLean[]; priceHistory?: HistLean[]; updatedAt?: Date;
};

/** GET /api/v1/items/:id → full item detail (links, price history, photos, warranty, purchase)
 *  plus a computed `price` block (best-now / where-to-buy / verdict) for the PricePanel. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(req, async () => {
    const { id } = await params;
    if (!isObjectId(id)) return apiError('bad id');
    await connectDB();
    const Item = await currentModel(ItemModel);
    const doc = (await Item.findById(id).lean()) as ItemDetailLean | null;
    if (!doc) return apiError('not found', 404);
    const links = (doc.links ?? []).map((l) => ({ label: l.label ?? '', url: l.url, price: l.price ?? null }));
    const priceHistory = [...(doc.priceHistory ?? [])]
      .map((h) => ({ price: h.price, store: h.store, date: new Date(h.date).toISOString() }))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const settings = await getAppSettings();
    const market = marketFor(settings.shoppingCountry, settings.shoppingExtraShops);
    // The summary reads the stored history, which still carries each entry's url for the market
    // filter; the `priceHistory` returned below keeps its documented shape.
    const price = priceStatus({ currentPrice: doc.currentPrice ?? 0, targetPrice: doc.targetPrice ?? null, links, priceHistory: doc.priceHistory ?? [] }, market);
    const attachments = (doc.attachments ?? []).map((a) => ({
      path: a.path,
      name: a.name ?? '',
      mimeType: a.mimeType ?? '',
      size: a.size ?? 0,
      uploadedAt: a.uploadedAt ? new Date(a.uploadedAt).toISOString() : new Date(0).toISOString(),
    }));
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
        // P9: prices above are base currency; these say what the receipt printed (see lib/fx.ts).
        currency: doc.currency ?? '',
        origAmount: doc.origAmount ?? 0,
        fxRate: doc.fxRate ?? 0,
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
        attachments,
        links,
        priceHistory,
        price,
        updatedAt: iso(doc.updatedAt),
      },
    });
  });
}

/** PATCH /api/v1/items/:id  { title?, status?, category?, currentPrice?, targetPrice?, specs?, tags?, currency?, fxRate? }
 *  currency/fxRate (P9): sending any money field re-resolves the WHOLE price set against the
 *  base currency, so the stored prices are always base-denominated and consistent with each other. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(req, async () => {
    const { id } = await params;
    if (!isObjectId(id)) return apiError('bad id');
    const b = await readBody(req);
    const set: Record<string, unknown> = {};
    if (typeof b.title === 'string' && b.title.trim()) set.title = b.title.trim();
    if (typeof b.status === 'string' && STATUS.includes(b.status)) set.status = b.status;
    if (typeof b.category === 'string') set.category = b.category;
    if (typeof b.specs === 'string') set.specs = b.specs;
    if (typeof b.currentPrice === 'number') set.currentPrice = b.currentPrice;
    if ('targetPrice' in b) set.targetPrice = b.targetPrice == null ? null : Number(b.targetPrice);
    if (Array.isArray(b.tags)) set.tags = b.tags.map(String);
    // P9: money fields arrive as PRINTED figures. Because the stored prices are base currency,
    // touching the price, the target, the currency OR the rate means the whole set has to be
    // recomputed together from the current doc — a partial PATCH must never leave a record
    // half-converted (e.g. a new rate applied to currentPrice but not to purchasedPrice).
    // Bodies without any of these skip the extra read entirely.
    const touchesFx =
      typeof b.currentPrice === 'number' || 'targetPrice' in b || typeof b.currency === 'string' || b.fxRate != null;
    if (!Object.keys(set).length && !touchesFx) return apiError('no valid fields');
    await connectDB();
    const Item = await currentModel(ItemModel);
    if (touchesFx) {
      const existing = (await Item.findById(id).lean()) as ItemDetailLean | null;
      if (!existing) return apiError('not found', 404);
      const base = (await getAppSettings()).currency;
      // Un-convert what is stored back to PRINTED figures first, so a newly supplied rate
      // applies to the paper amounts instead of compounding on top of an earlier conversion.
      const oldRate = isForeignCurrency(existing.currency, base) ? existing.fxRate ?? 0 : 0;
      const printed = (v: number | null | undefined): number | null =>
        v == null ? null : oldRate > 0 ? toPrinted(v, oldRate) : v;
      const money = resolveItemPrices(
        {
          currentPrice:
            typeof set.currentPrice === 'number' ? set.currentPrice : printed(existing.currentPrice) ?? 0,
          purchasedPrice: printed(existing.purchasedPrice),
          targetPrice: 'targetPrice' in set ? (set.targetPrice as number | null) : printed(existing.targetPrice),
          currency: typeof b.currency === 'string' ? b.currency : existing.currency ?? '',
          fxRate: b.fxRate != null && Number.isFinite(Number(b.fxRate)) ? Number(b.fxRate) : existing.fxRate ?? 0,
        },
        base
      );
      Object.assign(set, money);
    }
    const doc = await Item.findByIdAndUpdate(id, { $set: set }, { returnDocument: 'after' }).lean();
    if (!doc) return apiError('not found', 404);
    const i = doc as { _id: unknown; title: string; status?: string; category?: string; currentPrice?: number; targetPrice?: number | null; currency?: string; origAmount?: number; fxRate?: number; updatedAt?: Date };
    return NextResponse.json({
      item: {
        id: String(i._id),
        title: i.title,
        status: i.status ?? 'researching',
        category: i.category ?? '',
        currentPrice: i.currentPrice ?? 0,
        targetPrice: i.targetPrice ?? null,
        currency: i.currency ?? '',
        origAmount: i.origAmount ?? 0,
        fxRate: i.fxRate ?? 0,
        updatedAt: iso(i.updatedAt),
      },
    });
  });
}

/** DELETE /api/v1/items/:id  → soft-delete (recoverable from Trash). */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(req, async () => {
    const { id } = await params;
    if (!isObjectId(id)) return apiError('bad id');
    await connectDB();
    const Item = await currentModel(ItemModel);
    const doc = await Item.findByIdAndUpdate(id, { $set: { deletedAt: new Date() } }, { returnDocument: 'after' }).lean();
    if (!doc) return apiError('not found', 404);
    return NextResponse.json({ ok: true, id });
  });
}
