import { NextRequest, NextResponse } from 'next/server';
import { withAuth, apiError } from '@/lib/apiAuth';
import { isObjectId, readBody } from '@/lib/apiBody';
import { connectDB } from '@/lib/db';
import { Expense } from '@/models/Expense';
import { vendorKey } from '@/app/expenses/lib';
import { getAppSettings } from '@/lib/appSettings';
import { resolveFx, isForeignCurrency } from '@/lib/fx';
import { trimExpense, parseSplitField, type ExpenseLean } from '../serialize';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** PATCH /api/v1/expenses/:id  { vendor?, amount?, category?, space?, kind?, notes?, date?, period?, recurring?, recurringCycle?, paymentMethod?, split?, taxDeductible?, taxCategory?, currency?, fxRate? }
 *
 *  P9: `amount` arrives as the PRINTED figure (what the bill says), while the stored one is
 *  base currency, so touching the amount, the currency OR the rate recomputes all four fields
 *  together from the current doc — a partial PATCH must never leave an expense half-converted.
 *  Bodies with none of the three skip the extra read entirely. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(req, async () => {
    const { id } = await params;
    if (!isObjectId(id)) return apiError('bad id');
    const b = await readBody(req);
    const set: Record<string, unknown> = {};
    if (typeof b.vendor === 'string' && b.vendor.trim()) { set.vendor = b.vendor.trim(); set.vendorKey = vendorKey(b.vendor.trim()); }
    if (b.amount != null && Number.isFinite(Number(b.amount))) set.amount = Number(b.amount);
    if (typeof b.category === 'string') set.category = b.category;
    if (typeof b.space === 'string') set.space = b.space.trim().slice(0, 40);
    if (b.kind === 'income' || b.kind === 'expense') set.kind = b.kind;
    if (typeof b.notes === 'string') set.notes = b.notes;
    if (b.date) { const d = new Date(String(b.date)); if (!Number.isNaN(d.getTime())) set.date = d; }
    if (typeof b.period === 'string') set.period = b.period;
    if (typeof b.recurring === 'boolean') set.recurring = b.recurring;
    // empty string clears the cycle; same enum guard as POST /api/v1/expenses
    if (b.recurringCycle === '' || ['monthly', 'quarterly', 'yearly', 'weekly'].includes(String(b.recurringCycle))) set.recurringCycle = String(b.recurringCycle);
    if (typeof b.paymentMethod === 'string') set.paymentMethod = b.paymentMethod;
    if (Array.isArray(b.split)) set.split = parseSplitField(b.split);
    if (typeof b.taxDeductible === 'boolean') set.taxDeductible = b.taxDeductible;
    if (typeof b.taxCategory === 'string') set.taxCategory = b.taxCategory.trim().slice(0, 60);
    await connectDB();

    // Runs BEFORE the "no valid fields" guard: `{ currency }` or `{ fxRate }` alone is a
    // legitimate edit (correcting the rate of an already-saved foreign expense) even though
    // neither writes into `set` by itself.
    const touchesFx = set.amount != null || typeof b.currency === 'string' || b.fxRate != null;
    if (touchesFx) {
      const existing = (await Expense.findById(id).lean()) as ExpenseLean | null;
      if (!existing) return apiError('not found', 404);
      const base = (await getAppSettings()).currency;
      // The printed amount of a foreign expense lives in origAmount; of a base-currency one, in amount.
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

    if (!Object.keys(set).length) return apiError('no valid fields');
    const doc = await Expense.findByIdAndUpdate(id, { $set: set }, { new: true }).lean();
    if (!doc) return apiError('not found', 404);
    // Spec: PATCH returns { expense: Expense } (the updated doc), same shape as the list/rescan trim.
    return NextResponse.json({ expense: trimExpense(doc as ExpenseLean) });
  });
}

/** DELETE /api/v1/expenses/:id → soft-delete (recoverable from Trash). */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(req, async () => {
    const { id } = await params;
    if (!isObjectId(id)) return apiError('bad id');
    await connectDB();
    const doc = await Expense.findByIdAndUpdate(id, { $set: { deletedAt: new Date() } }, { new: true }).lean();
    if (!doc) return apiError('not found', 404);
    return NextResponse.json({ ok: true, id });
  });
}
