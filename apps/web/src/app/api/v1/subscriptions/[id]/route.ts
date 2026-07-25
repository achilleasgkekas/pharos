import { NextRequest, NextResponse } from 'next/server';
import { withAuth, apiError } from '@/lib/apiAuth';
import { isObjectId, readBody } from '@/lib/apiBody';
import { connectDB } from '@/lib/db';
import { getAppSettings } from '@/lib/appSettings';
import { resolveFx, convertToBase, isForeignCurrency } from '@/lib/fx';
import { Subscription } from '@/models/Subscription';
import { trim, type SubLean } from '../route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CYCLES = ['monthly', 'yearly', 'quarterly', 'weekly', 'lifetime'];

/** PATCH /api/v1/subscriptions/:id  { name?, amount?, billingCycle?, nextRenewal?, category?, active?, trialEndsAt?, firstChargeAmount?, currency?, fxRate? }
 *  trialEndsAt: an ISO date string sets it, `null` explicitly clears it (trial converted/cancelled).
 *  currency/fxRate (P9): sending any money field re-resolves the whole set against the base
 *  currency, so `amount` in the response is always base-denominated. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(req, async () => {
    const { id } = await params;
    if (!isObjectId(id)) return apiError('bad id');
    const b = await readBody(req);
    const set: Record<string, unknown> = {};
    if (typeof b.name === 'string' && b.name.trim()) set.name = b.name.trim();
    if (b.amount != null && Number.isFinite(Number(b.amount))) set.amount = Number(b.amount);
    if (typeof b.billingCycle === 'string' && CYCLES.includes(b.billingCycle)) set.billingCycle = b.billingCycle;
    if (typeof b.category === 'string') set.category = b.category;
    if (typeof b.active === 'boolean') set.active = b.active;
    if (b.nextRenewal) { const d = new Date(String(b.nextRenewal)); if (!Number.isNaN(d.getTime())) set.nextRenewal = d; }
    if (b.trialEndsAt === null) set.trialEndsAt = null;
    else if (b.trialEndsAt) { const d = new Date(String(b.trialEndsAt)); if (!Number.isNaN(d.getTime())) set.trialEndsAt = d; }
    if (b.firstChargeAmount != null && Number.isFinite(Number(b.firstChargeAmount))) set.firstChargeAmount = Number(b.firstChargeAmount);
    // P9: money fields arrive as PRINTED figures. Because `amount` is stored in base currency,
    // touching the amount, the currency, the rate OR the first charge means all of them have to
    // be recomputed together from the current doc — a partial PATCH must never leave a record
    // half-converted. Bodies without any of these skip the extra read entirely.
    const touchesFx =
      b.amount != null || typeof b.currency === 'string' || b.fxRate != null || b.firstChargeAmount != null;
    if (!Object.keys(set).length && !touchesFx) return apiError('no valid fields');
    await connectDB();
    if (touchesFx) {
      const existing = (await Subscription.findById(id).lean()) as SubLean | null;
      if (!existing) return apiError('not found', 404);
      const base = (await getAppSettings()).currency;
      // The printed amount of a foreign sub lives in origAmount; of a base-currency one, in amount.
      const wasForeign = isForeignCurrency(existing.currency, base);
      const printed =
        typeof set.amount === 'number'
          ? set.amount
          : ((wasForeign ? existing.origAmount || existing.amount : existing.amount) ?? 0);
      const currency = typeof b.currency === 'string' ? b.currency : (existing.currency ?? base);
      const rate =
        b.fxRate != null && Number.isFinite(Number(b.fxRate)) ? Number(b.fxRate) : (existing.fxRate ?? 0);
      const fx = resolveFx({ amount: printed, currency, fxRate: rate }, base);
      set.amount = fx.amount;
      set.currency = fx.currency;
      set.origAmount = fx.origAmount;
      set.fxRate = fx.fxRate;
      if (typeof set.firstChargeAmount === 'number' && fx.fxRate > 0) {
        set.firstChargeAmount = convertToBase(set.firstChargeAmount, fx.fxRate);
      }
    }
    const doc = await Subscription.findByIdAndUpdate(id, { $set: set }, { new: true }).lean();
    if (!doc) return apiError('not found', 404);
    // Spec: PATCH returns { subscription: Subscription } (the updated doc), same trim as the list route.
    return NextResponse.json({ subscription: trim(doc as SubLean) });
  });
}

/** DELETE /api/v1/subscriptions/:id → soft-delete (recoverable from Trash). */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(req, async () => {
    const { id } = await params;
    if (!isObjectId(id)) return apiError('bad id');
    await connectDB();
    const doc = await Subscription.findByIdAndUpdate(id, { $set: { deletedAt: new Date() } }, { new: true }).lean();
    if (!doc) return apiError('not found', 404);
    return NextResponse.json({ ok: true, id });
  });
}
