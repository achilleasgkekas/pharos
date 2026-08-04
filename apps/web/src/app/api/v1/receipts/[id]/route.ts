import { NextRequest, NextResponse } from 'next/server';
import { withAuth, apiError } from '@/lib/apiAuth';
import { isObjectId, readBody } from '@/lib/apiBody';
import { iso } from '@/lib/apiList';
import { connectDB } from '@/lib/db';
import { Receipt as ReceiptModel } from '@/models/Receipt';
import { currentModel } from '@/lib/tenancy/connection';
import { getStores } from '@/lib/storeService';
import { getAppSettings } from '@/lib/appSettings';
import { effectiveReturnWindow, returnDaysLeft as computeReturnDays } from '@/lib/returnWindow';
import { isForeignCurrency, resolveReceiptAmounts, toPrinted } from '@/lib/fx';
import { trimReceipt, serializeLineItems } from '../serialize';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Stored line-item shape, as PATCH writes it back (price is the unit NET). */
type StoredLine = { name: string; refinedName: string; qty: number; price: number; vatRate: number };
/** The money side of the stored receipt, read only when a PATCH touches it (P9). */
type ReceiptFxLean = {
  currency?: string; fxRate?: number; total?: number; origAmount?: number;
  subtotal?: number; vatAmount?: number; lineItems?: unknown[];
};

/** GET /api/v1/receipts/:id → the receipt plus its line items. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(req, async () => {
    const { id } = await params;
    if (!isObjectId(id)) return apiError('bad id');
    await connectDB();
    const Receipt = await currentModel(ReceiptModel);
    const doc = await Receipt.findById(id).select('-rawAiResponse').lean();
    if (!doc) return apiError('not found', 404);
    const r = doc as Parameters<typeof trimReceipt>[0] & { notes?: string };
    // PA3 return-window badge (mirrors the list route + apps/web/src/app/receipts/page.tsx).
    let days: number | undefined;
    if (!r.archived) {
      const [stores, settings] = await Promise.all([getStores(), getAppSettings()]);
      const win = effectiveReturnWindow(r.store, stores, settings.defaultReturnWindowDays);
      days = computeReturnDays(r.date, win) ?? undefined;
    }
    return NextResponse.json({
      receipt: {
        ...trimReceipt(r, days),
        notes: r.notes ?? '',
        lineItems: serializeLineItems(r.lineItems),
      },
    });
  });
}

/**
 * PATCH /api/v1/receipts/:id  { store?, date?, total?, subtotal?, vatAmount?, paymentMethod?,
 *                               notes?, verified?, archived?, lineItems?, currency?, fxRate? }
 *
 * Multi-currency (P9): every money field arrives as the figure PRINTED on the receipt, and the
 * route converts the whole document with one rate (fx.resolveReceiptAmounts, the same helper the
 * web form uses). A body with no money field skips the extra read and behaves exactly as before.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(req, async () => {
    const { id } = await params;
    if (!isObjectId(id)) return apiError('bad id');
    const b = await readBody(req);
    const set: Record<string, unknown> = {};
    if (typeof b.store === 'string' && b.store.trim()) set.store = b.store.trim();
    if (b.date) { const d = new Date(String(b.date)); if (!Number.isNaN(d.getTime())) set.date = d; }
    for (const k of ['total', 'subtotal', 'vatAmount'] as const) {
      if (b[k] != null && Number.isFinite(Number(b[k]))) set[k] = Number(b[k]);
    }
    if (typeof b.paymentMethod === 'string') set.paymentMethod = b.paymentMethod;
    if (typeof b.notes === 'string') set.notes = b.notes;
    if (typeof b.verified === 'boolean') set.verified = b.verified;
    if (typeof b.archived === 'boolean') set.archived = b.archived;
    if (Array.isArray(b.lineItems)) {
      // Sanitize edited line items. `price` is the stored unit NET (excl. VAT).
      // refinedName is cleared so the edited `name` wins (GET returns refinedName||name).
      type LineIn = { name?: unknown; qty?: unknown; price?: unknown; vatRate?: unknown };
      const numOr = (v: unknown, d: number, min = 0) => { const n = Number(v); return Number.isFinite(n) && n >= min ? n : d; };
      set.lineItems = (b.lineItems as LineIn[])
        .map((l) => ({ name: String(l.name ?? '').trim(), refinedName: '', qty: numOr(l.qty, 1, 0.0001), price: numOr(l.price, 0), vatRate: numOr(l.vatRate, 0) }))
        .filter((l) => l.name || l.price > 0);
    }
    // P9: touching ANY money field (or the currency/rate themselves) means the receipt has to
    // be re-resolved as a whole — a partial update must never leave it half-converted, with a
    // new rate applied to the total but not to its VAT or its line prices.
    const touchesFx =
      set.total !== undefined || set.subtotal !== undefined || set.vatAmount !== undefined ||
      set.lineItems !== undefined || typeof b.currency === 'string' || b.fxRate != null;
    if (!Object.keys(set).length && !touchesFx) return apiError('no valid fields');
    await connectDB();
    const Receipt = await currentModel(ReceiptModel);
    if (touchesFx) {
      const existing = (await Receipt.findById(id)
        .select('currency fxRate total origAmount subtotal vatAmount lineItems')
        .lean()) as ReceiptFxLean | null;
      if (!existing) return apiError('not found', 404);
      const base = (await getAppSettings()).currency;
      // Un-convert what is stored back to PRINTED figures first, so a newly supplied rate
      // applies to the paper amounts instead of compounding on an earlier conversion. The
      // headline total keeps its printed value verbatim in origAmount; the rest is recovered.
      const oldRate = isForeignCurrency(existing.currency, base) ? existing.fxRate ?? 0 : 0;
      const storedLines = (existing.lineItems ?? []) as StoredLine[];
      const printedLines =
        (set.lineItems as StoredLine[] | undefined) ??
        storedLines.map((l) => ({ ...l, price: toPrinted(Number(l.price) || 0, oldRate) }));
      const money = resolveReceiptAmounts(
        {
          total:
            set.total !== undefined
              ? (set.total as number)
              : oldRate > 0 && (existing.origAmount ?? 0) > 0
                ? (existing.origAmount as number)
                : existing.total ?? 0,
          subtotal: set.subtotal !== undefined ? (set.subtotal as number) : toPrinted(existing.subtotal ?? 0, oldRate),
          vatAmount: set.vatAmount !== undefined ? (set.vatAmount as number) : toPrinted(existing.vatAmount ?? 0, oldRate),
          linePrices: printedLines.map((l) => Number(l.price) || 0),
          currency: typeof b.currency === 'string' ? b.currency : existing.currency ?? '',
          fxRate: b.fxRate != null && Number.isFinite(Number(b.fxRate)) ? Number(b.fxRate) : existing.fxRate ?? 0,
        },
        base
      );
      set.total = money.total;
      set.currency = money.currency;
      set.origAmount = money.origAmount;
      set.fxRate = money.fxRate;
      // The secondary fields are only rewritten when the caller sent them or when the
      // conversion itself changed; otherwise a plain `{ verified }`-style edit would push
      // every stored cent through an un-convert/re-convert round trip for nothing.
      const conversionChanged = money.fxRate !== oldRate || money.currency !== (existing.currency || base);
      if (set.subtotal !== undefined || conversionChanged) set.subtotal = money.subtotal;
      if (set.vatAmount !== undefined || conversionChanged) set.vatAmount = money.vatAmount;
      if (set.lineItems !== undefined || conversionChanged) {
        set.lineItems = printedLines.map((l, i) => ({ ...l, price: money.linePrices[i] }));
      }
    }
    const doc = await Receipt.findByIdAndUpdate(id, { $set: set }, { new: true }).select('-rawAiResponse').lean();
    if (!doc) return apiError('not found', 404);
    return NextResponse.json({ ok: true, receipt: trimReceipt(doc as Parameters<typeof trimReceipt>[0]) });
  });
}
