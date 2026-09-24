import { NextRequest, NextResponse } from 'next/server';
import { RECURRING_CYCLES } from '@/lib/billingCycle';
import { withAuth, apiError } from '@/lib/apiAuth';
import { isObjectId, readBody } from '@/lib/apiBody';
import { connectDB } from '@/lib/db';
import { Bill as BillModel } from '@/models/Bill';
import { currentModel } from '@/lib/tenancy/connection';
import { spawnNextBillOnce } from '@/lib/billRecurrence';
import { getAppSettings } from '@/lib/appSettings';
import { resolveFx, isForeignCurrency } from '@/lib/fx';
import { trim, type BillLean } from '../serialize';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CYCLES: readonly string[] = RECURRING_CYCLES;

/** PATCH /api/v1/bills/:id  { title?, vendor?, amount?, dueDate?, category?, cycle?, notes?,
 *  archived?, paid?, paidDate? }
 *
 *  `paid: true` marks the bill paid (paidAt = paidDate or now) and — mirroring the web
 *  `markBillPaid` action — spawns the next pending instance one cycle ahead the FIRST time
 *  a recurring bill (cycle set) is paid. `paid: false` clears paidAt (undo). Plain field
 *  edits and the paid/unpaid transition can be sent in the same request. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(req, async () => {
    const { id } = await params;
    if (!isObjectId(id)) return apiError('bad id');
    const b = await readBody(req);
    const set: Record<string, unknown> = {};
    if (typeof b.title === 'string' && b.title.trim()) set.title = b.title.trim();
    if (typeof b.vendor === 'string') set.vendor = b.vendor.trim();
    if (typeof b.amount === 'number' || typeof b.amount === 'string') {
      const n = typeof b.amount === 'number' ? b.amount : parseFloat(b.amount);
      if (Number.isFinite(n)) set.amount = n;
    }
    if (typeof b.dueDate === 'string' && b.dueDate.trim()) {
      const d = new Date(b.dueDate);
      if (!Number.isNaN(d.getTime())) set.dueDate = d;
    }
    if (typeof b.category === 'string' && b.category.trim()) set.category = b.category.trim();
    if (typeof b.cycle === 'string' && CYCLES.includes(b.cycle)) set.cycle = b.cycle;
    if (typeof b.notes === 'string') set.notes = b.notes.trim();
    if (typeof b.space === 'string') set.space = b.space.trim().slice(0, 40); // #14 (P68)
    if (typeof b.archived === 'boolean') set.archived = b.archived;

    await connectDB();
    const Bill = await currentModel(BillModel);

    // P9: `amount` arrives as the PRINTED figure but is stored in base currency, so touching
    // the amount, the currency OR the rate means all four fields have to be recomputed together
    // from the current doc — a partial PATCH must never leave a bill half-converted. Bodies
    // without any of these skip the extra read entirely.
    const touchesFx = set.amount != null || typeof b.currency === 'string' || b.fxRate != null;
    if (touchesFx) {
      const existing = (await Bill.findById(id).lean()) as BillLean | null;
      if (!existing) return apiError('not found', 404);
      const base = (await getAppSettings()).currency;
      // The printed amount of a foreign bill lives in origAmount; of a base-currency one, in amount.
      const wasForeign = isForeignCurrency(existing.currency, base);
      const printed =
        typeof set.amount === 'number'
          ? set.amount
          : ((wasForeign ? existing.origAmount || existing.amount : existing.amount) ?? 0);
      const currency = typeof b.currency === 'string' ? b.currency : (existing.currency ?? base);
      const rate = b.fxRate != null && Number.isFinite(Number(b.fxRate)) ? Number(b.fxRate) : (existing.fxRate ?? 0);
      const fx = resolveFx({ amount: printed, currency, fxRate: rate }, base);
      set.amount = fx.amount;
      set.currency = fx.currency;
      set.origAmount = fx.origAmount;
      set.fxRate = fx.fxRate;
    }

    let spawnedNext = false;
    if (typeof b.paid === 'boolean') {
      const existing = await Bill.findById(id).lean();
      if (!existing) return apiError('not found', 404);
      if (b.paid) {
        const paidDate = typeof b.paidDate === 'string' && b.paidDate.trim() ? new Date(b.paidDate) : new Date();
        set.paidAt = Number.isNaN(paidDate.getTime()) ? new Date() : paidDate;
        const wasPaid = !!existing.paidAt;
        // #33: same once-per-bill spawn as the web markBillPaid action, so a `paid:false`
        // then `paid:true` round trip does not leave two copies of the next instance.
        if (!wasPaid && existing.cycle) {
          spawnedNext = await spawnNextBillOnce(Bill, existing);
        }
      } else {
        set.paidAt = null;
      }
    }

    if (!Object.keys(set).length) return apiError('no valid fields');
    const doc = await Bill.findByIdAndUpdate(id, { $set: set }, { returnDocument: 'after' }).lean();
    if (!doc) return apiError('not found', 404);
    return NextResponse.json({ bill: trim(doc as BillLean), spawnedNext });
  });
}

/** DELETE /api/v1/bills/:id → soft-delete (recoverable from Trash). */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(req, async () => {
    const { id } = await params;
    if (!isObjectId(id)) return apiError('bad id');
    await connectDB();
    const Bill = await currentModel(BillModel);
    const doc = await Bill.findByIdAndUpdate(id, { $set: { deletedAt: new Date() } }, { returnDocument: 'after' }).lean();
    if (!doc) return apiError('not found', 404);
    return NextResponse.json({ ok: true, id });
  });
}
