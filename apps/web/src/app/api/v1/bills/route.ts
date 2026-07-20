import { NextRequest, NextResponse } from 'next/server';
import { withAuth, apiError } from '@/lib/apiAuth';
import { listParams, withSince, listEnvelope, iso } from '@/lib/apiList';
import { readBody, strField, numField, enumField } from '@/lib/apiBody';
import { connectDB } from '@/lib/db';
import { Bill } from '@/models/Bill';
import { billStatus, type BillStatus } from '@/lib/bill';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CYCLES = ['', 'weekly', 'monthly', 'quarterly', 'yearly'] as const;

export type BillLean = {
  _id: unknown; title: string; vendor?: string; amount?: number; dueDate: Date;
  paidAt?: Date | null; category?: string; cycle?: string; notes?: string;
  archived?: boolean; linkedExpenseId?: string; updatedAt?: Date; deletedAt?: Date | null;
};

/** Single source of truth for the v1 Bill JSON shape (list, POST, PATCH). `status` is
 *  the same derived paid/overdue/due-soon/upcoming used by the web BillsClient —
 *  computed here so the mobile client never has to reimplement `billStatus`. */
export function trim(b: BillLean): {
  id: string; title: string; vendor: string; amount: number; dueDate: string | null;
  paidAt: string | null; category: string; cycle: string; notes: string; archived: boolean;
  status: BillStatus; updatedAt: string | null; deleted: boolean;
} {
  return {
    id: String(b._id), title: b.title, vendor: b.vendor ?? '', amount: b.amount ?? 0,
    dueDate: iso(b.dueDate), paidAt: iso(b.paidAt ?? null), category: b.category ?? 'other',
    cycle: b.cycle ?? '', notes: b.notes ?? '', archived: !!b.archived,
    status: billStatus(b.dueDate, b.paidAt ?? null),
    updatedAt: iso(b.updatedAt), deleted: !!b.deletedAt,
  };
}

/** GET /api/v1/bills?archived=1&paid=0&limit&offset&updatedSince
 *  Default excludes archived bills (mirrors the web BillsClient default view). */
export async function GET(req: NextRequest) {
  return withAuth(req, async () => {
    await connectDB();
    const p = listParams(req);
    const base: Record<string, unknown> = {};
    if (p.sp.get('archived') !== '1') base.archived = { $ne: true };
    if (p.sp.get('paid') === '0') base.paidAt = null;
    const filter = withSince(base, p);
    const find = Bill.find(filter).sort({ dueDate: 1 }).skip(p.offset).limit(p.limit);
    const count = Bill.countDocuments(filter);
    if (p.updatedSince) { find.setOptions({ withDeleted: true }); count.setOptions({ withDeleted: true }); }
    const [docs, total] = await Promise.all([find.lean() as Promise<BillLean[]>, count]);
    return NextResponse.json(listEnvelope(docs.map(trim), total, p));
  });
}

/** POST /api/v1/bills  { title, vendor?, amount?, dueDate, category?, cycle?, notes? } */
export async function POST(req: NextRequest) {
  return withAuth(req, async () => {
    const b = await readBody(req);
    const title = strField(b, 'title', '', true);
    if (!title) return apiError('title required');
    const dueDateRaw = strField(b, 'dueDate', '', true);
    const dueDate = dueDateRaw ? new Date(dueDateRaw) : null;
    if (!dueDate || Number.isNaN(dueDate.getTime())) return apiError('valid dueDate required');
    await connectDB();
    const doc = await Bill.create({
      title,
      vendor: strField(b, 'vendor', '', true),
      amount: numField(b, 'amount') ?? 0,
      dueDate,
      category: strField(b, 'category', 'other', true) || 'other',
      cycle: enumField(b, 'cycle', CYCLES, ''),
      notes: strField(b, 'notes', '', true),
      paidAt: null,
      archived: false,
    });
    return NextResponse.json({ bill: trim(doc.toObject() as BillLean) }, { status: 201 });
  });
}
