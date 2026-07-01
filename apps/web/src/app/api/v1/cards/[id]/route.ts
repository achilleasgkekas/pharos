import { NextRequest, NextResponse } from 'next/server';
import { withAuth, apiError } from '@/lib/apiAuth';
import { isObjectId, readBody } from '@/lib/apiBody';
import { cardFieldsFromBody } from '@/lib/cardFields';
import { connectDB } from '@/lib/db';
import { Card } from '@/models/Card';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** PATCH /api/v1/cards/:id  { name?, last4?, bank?, kind?, type?, color?, creditLimit?, notes?, active? }
 *  Also used to toggle a card on/off (send just { active }). */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(req, async () => {
    const { id } = await params;
    if (!isObjectId(id)) return apiError('bad id');
    const b = await readBody(req);
    const set = cardFieldsFromBody(b, true) ?? {};
    if (!Object.keys(set).length) return apiError('no valid fields');
    await connectDB();
    const doc = await Card.findByIdAndUpdate(id, { $set: set }, { new: true }).lean();
    if (!doc) return apiError('not found', 404);
    return NextResponse.json({ ok: true, id });
  });
}

/** DELETE /api/v1/cards/:id → permanent removal (cards are not soft-deleted, mirrors web deleteCard). */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(req, async () => {
    const { id } = await params;
    if (!isObjectId(id)) return apiError('bad id');
    await connectDB();
    const doc = await Card.findByIdAndDelete(id).lean();
    if (!doc) return apiError('not found', 404);
    return NextResponse.json({ ok: true, id });
  });
}
