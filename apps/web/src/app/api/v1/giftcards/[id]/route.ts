import { NextRequest, NextResponse } from 'next/server';
import { withAuth, apiError } from '@/lib/apiAuth';
import { isObjectId, readBody } from '@/lib/apiBody';
import { connectDB } from '@/lib/db';
import { GiftCard as GiftCardModel } from '@/models/GiftCard';
import { currentModel } from '@/lib/tenancy/connection';
import { safeDateOrNull } from '@/lib/dates';
import { trim, type GiftCardLean } from '../serialize';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** PATCH /api/v1/giftcards/:id  { title?, store?, code?, initialAmount?, expiresAt?, notes?,
 *  archived?, addUse?: { amount, note?, date? }, removeUseId? }
 *
 *  Plain field edits, archiving, and a single spend/reload/undo can be combined in one
 *  request (mirrors the Bills paid/unpaid combining pattern). `addUse` mirrors the web
 *  `addGiftCardUse` action — a positive amount records a spend, a negative amount a
 *  reload/top-up. `removeUseId` mirrors `removeGiftCardUse` (undo one entry). The two
 *  are mutually exclusive in a single request (both mutate the same `uses` array). */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(req, async () => {
    const { id } = await params;
    if (!isObjectId(id)) return apiError('bad id');
    const b = await readBody(req);
    const set: Record<string, unknown> = {};
    if (typeof b.title === 'string' && b.title.trim()) set.title = b.title.trim();
    if (typeof b.store === 'string') set.store = b.store.trim();
    if (typeof b.code === 'string') set.code = b.code.trim();
    if (typeof b.initialAmount === 'number' || typeof b.initialAmount === 'string') {
      const n = typeof b.initialAmount === 'number' ? b.initialAmount : parseFloat(b.initialAmount);
      if (Number.isFinite(n)) set.initialAmount = Math.max(0, n);
    }
    if (typeof b.expiresAt === 'string') set.expiresAt = safeDateOrNull(b.expiresAt);
    if (typeof b.notes === 'string') set.notes = b.notes.trim();
    if (typeof b.archived === 'boolean') set.archived = b.archived;

    const update: Record<string, unknown> = {};
    if (Object.keys(set).length) update.$set = set;

    const addUse = b.addUse as { amount?: unknown; note?: unknown; date?: unknown } | undefined;
    const removeUseId = typeof b.removeUseId === 'string' ? b.removeUseId : '';
    if (addUse && typeof addUse === 'object') {
      if (removeUseId) return apiError('cannot addUse and removeUseId in the same request');
      const amt = typeof addUse.amount === 'number' ? addUse.amount : parseFloat(String(addUse.amount));
      if (!Number.isFinite(amt) || amt === 0) return apiError('addUse.amount must be a non-zero number');
      const date = typeof addUse.date === 'string' ? safeDateOrNull(addUse.date) : null;
      update.$push = {
        uses: {
          amount: Math.round(amt * 100) / 100,
          note: typeof addUse.note === 'string' ? addUse.note.slice(0, 200) : '',
          date: date ?? new Date(),
        },
      };
    } else if (removeUseId) {
      update.$pull = { uses: { _id: removeUseId } };
    }

    if (!Object.keys(update).length) return apiError('no valid fields');

    await connectDB();
    const GiftCard = await currentModel(GiftCardModel);
    const doc = await GiftCard.findByIdAndUpdate(id, update, { returnDocument: 'after' }).lean();
    if (!doc) return apiError('not found', 404);
    return NextResponse.json({ giftCard: trim(doc as GiftCardLean) });
  });
}

/** DELETE /api/v1/giftcards/:id → soft-delete (recoverable from Trash, same as Bills/Vouchers). */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(req, async () => {
    const { id } = await params;
    if (!isObjectId(id)) return apiError('bad id');
    await connectDB();
    const GiftCard = await currentModel(GiftCardModel);
    const doc = await GiftCard.findByIdAndUpdate(id, { $set: { deletedAt: new Date() } }, { returnDocument: 'after' }).lean();
    if (!doc) return apiError('not found', 404);
    return NextResponse.json({ ok: true, id });
  });
}
