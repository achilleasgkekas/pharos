import { NextRequest, NextResponse } from 'next/server';
import { RECURRING_CYCLES } from '@/lib/billingCycle';
import { withAuth, apiError } from '@/lib/apiAuth';
import { listParams, withSince, listEnvelope } from '@/lib/apiList';
import { readBody, strField, numField, enumField } from '@/lib/apiBody';
import { connectDB } from '@/lib/db';
import { Bill as BillModel } from '@/models/Bill';
import { currentModel } from '@/lib/tenancy/connection';
import { getAppSettings } from '@/lib/appSettings';
import { resolveFx } from '@/lib/fx';
import { trim, type BillLean } from './serialize';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CYCLES = RECURRING_CYCLES;

/** GET /api/v1/bills?archived=1&paid=0&limit&offset&updatedSince
 *  Default excludes archived bills (mirrors the web BillsClient default view). */
export async function GET(req: NextRequest) {
  return withAuth(req, async () => {
    await connectDB();
    const Bill = await currentModel(BillModel);
    const p = listParams(req);
    const base: Record<string, unknown> = {};
    if (p.sp.get('archived') !== '1') base.archived = { $ne: true };
    if (p.sp.get('paid') === '0') base.paidAt = null;
    const filter = withSince(base, p);
    const find = Bill.find(filter).sort({ dueDate: 1 }).skip(p.offset).limit(p.limit);
    const count = Bill.countDocuments(filter);
    if (p.updatedSince) { find.setOptions({ withDeleted: true }); count.setOptions({ withDeleted: true }); }
    const [docs, total] = await Promise.all([find.lean() as Promise<BillLean[]>, count]);
    const baseCurr = (await getAppSettings()).currency;
    return NextResponse.json(listEnvelope(docs.map((d) => trim(d, baseCurr)), total, p));
  });
}

/** POST /api/v1/bills  { title, vendor?, amount?, dueDate, category?, cycle?, notes?, currency?, fxRate? }
 *  P9: `amount` is read as the PRINTED figure; when `currency` differs from the deployment's
 *  base one it is converted with `fxRate` before storage, so what lands in the DB is always
 *  base currency. Omitting both keeps the previous single-currency behaviour exactly. */
export async function POST(req: NextRequest) {
  return withAuth(req, async () => {
    const b = await readBody(req);
    const title = strField(b, 'title', '', true);
    if (!title) return apiError('title required');
    const dueDateRaw = strField(b, 'dueDate', '', true);
    const dueDate = dueDateRaw ? new Date(dueDateRaw) : null;
    if (!dueDate || Number.isNaN(dueDate.getTime())) return apiError('valid dueDate required');
    await connectDB();
    const Bill = await currentModel(BillModel);
    const fx = resolveFx(
      { amount: numField(b, 'amount') ?? 0, currency: strField(b, 'currency'), fxRate: numField(b, 'fxRate') ?? 0 },
      (await getAppSettings()).currency
    );
    const doc = await Bill.create({
      title,
      vendor: strField(b, 'vendor', '', true),
      amount: fx.amount,
      currency: fx.currency,
      origAmount: fx.origAmount,
      fxRate: fx.fxRate,
      dueDate,
      category: strField(b, 'category', 'other', true) || 'other',
      cycle: enumField(b, 'cycle', CYCLES, ''),
      notes: strField(b, 'notes', '', true),
      space: strField(b, 'space').trim().slice(0, 40), // #14 (P68): per-property ledger tag
      paidAt: null,
      archived: false,
    });
    return NextResponse.json({ bill: trim(doc.toObject() as BillLean, (await getAppSettings()).currency) }, { status: 201 });
  });
}
