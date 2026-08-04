import { NextRequest, NextResponse } from 'next/server';
import { withAuth, apiError } from '@/lib/apiAuth';
import { listParams, withSince, listEnvelope, iso } from '@/lib/apiList';
import { readBody, strField, numField } from '@/lib/apiBody';
import { connectDB } from '@/lib/db';
import { Goal as GoalModel } from '@/models/Goal';
import { currentModel } from '@/lib/tenancy/connection';
import { goalProgress } from '@/lib/goals';
import { safeDateOrNull } from '@/lib/dates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export type GoalContributionLean = { _id: unknown; amount: number; date?: Date | null; note?: string };
export type GoalLean = {
  _id: unknown; title: string; targetAmount: number; targetDate?: Date | null; category?: string;
  notes?: string; archived?: boolean; contributions?: GoalContributionLean[];
  updatedAt?: Date; deletedAt?: Date | null;
};

/** Single source of truth for the v1 Goal JSON shape (list, POST, PATCH). `current`/`remaining`/
 *  `pct`/`done`/`monthsLeft`/`perMonth` are the same derived values the web ReportsClient computes
 *  client-side (lib/goals.ts, never stored) — computed here so the mobile client never has to
 *  reimplement the progress math. */
export function trim(g: GoalLean): {
  id: string; title: string; targetAmount: number; targetDate: string | null; category: string;
  notes: string; archived: boolean; current: number; remaining: number; pct: number; done: boolean;
  monthsLeft: number | null; perMonth: number | null;
  contributions: Array<{ id: string; amount: number; date: string | null; note: string }>;
  updatedAt: string | null; deleted: boolean;
} {
  const contributions = g.contributions ?? [];
  const progress = goalProgress({ targetAmount: g.targetAmount ?? 0, targetDate: g.targetDate ?? null, contributions });
  return {
    id: String(g._id), title: g.title, targetAmount: g.targetAmount ?? 0, targetDate: iso(g.targetDate ?? null),
    category: g.category ?? '', notes: g.notes ?? '', archived: !!g.archived,
    current: progress.current, remaining: progress.remaining, pct: progress.pct, done: progress.done,
    monthsLeft: progress.monthsLeft, perMonth: progress.perMonth,
    contributions: contributions.map((c) => ({ id: String(c._id), amount: c.amount, date: iso(c.date ?? null), note: c.note ?? '' })),
    updatedAt: iso(g.updatedAt), deleted: !!g.deletedAt,
  };
}

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
