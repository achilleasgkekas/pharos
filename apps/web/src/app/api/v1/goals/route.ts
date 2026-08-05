import { NextRequest, NextResponse } from 'next/server';
import { withAuth, apiError } from '@/lib/apiAuth';
import { listParams, withSince, listEnvelope } from '@/lib/apiList';
import { readBody, strField, numField } from '@/lib/apiBody';
import { connectDB } from '@/lib/db';
import { Goal as GoalModel } from '@/models/Goal';
import { currentModel } from '@/lib/tenancy/connection';
import { safeDateOrNull } from '@/lib/dates';
import { trim, type GoalLean } from './serialize';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/v1/goals?archived=1&limit&offset&updatedSince
 *  Default excludes archived goals (mirrors the web Reports "Goals" card default view). */
export async function GET(req: NextRequest) {
  return withAuth(req, async () => {
    await connectDB();
    const Goal = await currentModel(GoalModel);
    const p = listParams(req);
    const base: Record<string, unknown> = {};
    if (p.sp.get('archived') !== '1') base.archived = { $ne: true };
    const filter = withSince(base, p);
    const find = Goal.find(filter).sort({ archived: 1, targetDate: 1, createdAt: -1 }).skip(p.offset).limit(p.limit);
    const count = Goal.countDocuments(filter);
    if (p.updatedSince) { find.setOptions({ withDeleted: true }); count.setOptions({ withDeleted: true }); }
    const [docs, total] = await Promise.all([find.lean() as Promise<GoalLean[]>, count]);
    return NextResponse.json(listEnvelope(docs.map(trim), total, p));
  });
}

/** POST /api/v1/goals  { title, targetAmount?, targetDate?, category?, notes? } */
export async function POST(req: NextRequest) {
  return withAuth(req, async () => {
    const b = await readBody(req);
    const title = strField(b, 'title', '', true);
    if (!title) return apiError('title required');
    const targetRaw = numField(b, 'targetAmount');
    await connectDB();
    const Goal = await currentModel(GoalModel);
    const doc = await Goal.create({
      title,
      targetAmount: targetRaw !== null ? Math.max(0, targetRaw) : 0,
      targetDate: safeDateOrNull(strField(b, 'targetDate', '', true)),
      category: strField(b, 'category', '', true),
      notes: strField(b, 'notes', '', true),
      contributions: [],
      archived: false,
    });
    return NextResponse.json({ goal: trim(doc.toObject() as GoalLean) }, { status: 201 });
  });
}
