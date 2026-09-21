import { NextRequest, NextResponse } from 'next/server';
import { withAuth, apiError } from '@/lib/apiAuth';
import { isObjectId, readBody } from '@/lib/apiBody';
import { connectDB } from '@/lib/db';
import { Goal as GoalModel } from '@/models/Goal';
import { currentModel } from '@/lib/tenancy/connection';
import { safeDateOrNull } from '@/lib/dates';
import { trim, type GoalLean } from '../serialize';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** PATCH /api/v1/goals/:id  { title?, targetAmount?, targetDate?, category?, notes?, archived?,
 *  addContribution?: { amount, note?, date? }, removeContributionId? }
 *
 *  Plain field edits, archiving, and a single contribution add/undo can be combined in one
 *  request (mirrors the GiftCard addUse/removeUseId pattern). `addContribution` mirrors the
 *  web `addGoalContribution` action — amount must be positive (a goal only ever gains money
 *  through contributions; mistaken entries are undone via `removeContributionId`, not negated).
 *  The two are mutually exclusive in a single request (both mutate the same `contributions`
 *  array). */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(req, async () => {
    const { id } = await params;
    if (!isObjectId(id)) return apiError('bad id');
    const b = await readBody(req);
    const set: Record<string, unknown> = {};
    if (typeof b.title === 'string' && b.title.trim()) set.title = b.title.trim();
    if (typeof b.targetAmount === 'number' || typeof b.targetAmount === 'string') {
      const n = typeof b.targetAmount === 'number' ? b.targetAmount : parseFloat(b.targetAmount);
      if (Number.isFinite(n)) set.targetAmount = Math.max(0, n);
    }
    if (typeof b.targetDate === 'string') set.targetDate = safeDateOrNull(b.targetDate);
    if (typeof b.category === 'string') set.category = b.category.trim();
    if (typeof b.notes === 'string') set.notes = b.notes.trim();
    if (typeof b.archived === 'boolean') set.archived = b.archived;

    const update: Record<string, unknown> = {};
    if (Object.keys(set).length) update.$set = set;

    const addContribution = b.addContribution as { amount?: unknown; note?: unknown; date?: unknown } | undefined;
    const removeContributionId = typeof b.removeContributionId === 'string' ? b.removeContributionId : '';
    if (addContribution && typeof addContribution === 'object') {
      if (removeContributionId) return apiError('cannot addContribution and removeContributionId in the same request');
      const amt = typeof addContribution.amount === 'number' ? addContribution.amount : parseFloat(String(addContribution.amount));
      if (!Number.isFinite(amt) || amt <= 0) return apiError('addContribution.amount must be a positive number');
      const date = typeof addContribution.date === 'string' ? safeDateOrNull(addContribution.date) : null;
      update.$push = {
        contributions: {
          amount: Math.round(amt * 100) / 100,
          note: typeof addContribution.note === 'string' ? addContribution.note.slice(0, 200) : '',
          date: date ?? new Date(),
        },
      };
    } else if (removeContributionId) {
      update.$pull = { contributions: { _id: removeContributionId } };
    }

    if (!Object.keys(update).length) return apiError('no valid fields');

    await connectDB();
    const Goal = await currentModel(GoalModel);
    const doc = await Goal.findByIdAndUpdate(id, update, { returnDocument: 'after' }).lean();
    if (!doc) return apiError('not found', 404);
    return NextResponse.json({ goal: trim(doc as GoalLean) });
  });
}

/** DELETE /api/v1/goals/:id → soft-delete (recoverable from Trash, same as Bills/GiftCards). */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(req, async () => {
    const { id } = await params;
    if (!isObjectId(id)) return apiError('bad id');
    await connectDB();
    const Goal = await currentModel(GoalModel);
    const doc = await Goal.findByIdAndUpdate(id, { $set: { deletedAt: new Date() } }, { returnDocument: 'after' }).lean();
    if (!doc) return apiError('not found', 404);
    return NextResponse.json({ ok: true, id });
  });
}
