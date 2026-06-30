import { NextRequest, NextResponse } from 'next/server';
import { withAuth, apiError } from '@/lib/apiAuth';
import { connectDB } from '@/lib/db';
import { Card } from '@/models/Card';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const KINDS = ['credit', 'debit'];
const TYPES = ['mastercard', 'visa', 'amex', 'maestro', 'other'];

/** PATCH /api/v1/cards/:id  { name?, last4?, bank?, kind?, type?, color?, creditLimit?, notes?, active? }
 *  Also used to toggle a card on/off (send just { active }). */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(req, async () => {
    const { id } = await params;
    if (!/^[a-f0-9]{24}$/i.test(id)) return apiError('bad id');
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const set: Record<string, unknown> = {};
    if (typeof b.name === 'string' && b.name.trim()) set.name = b.name.trim();
    if (typeof b.last4 === 'string') set.last4 = b.last4.replace(/\D/g, '').slice(0, 4);
    if (typeof b.bank === 'string') set.bank = b.bank.trim();
    if (typeof b.kind === 'string' && KINDS.includes(b.kind)) set.kind = b.kind;
    if (typeof b.type === 'string' && TYPES.includes(b.type)) set.type = b.type;
    if (typeof b.color === 'string' && b.color.trim()) set.color = b.color.trim();
    if (b.creditLimit != null && Number.isFinite(Number(b.creditLimit))) set.creditLimit = Math.max(0, Number(b.creditLimit));
    if (typeof b.notes === 'string') set.notes = b.notes.trim();
    if (typeof b.active === 'boolean') set.active = b.active;
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
    if (!/^[a-f0-9]{24}$/i.test(id)) return apiError('bad id');
    await connectDB();
    const doc = await Card.findByIdAndDelete(id).lean();
    if (!doc) return apiError('not found', 404);
    return NextResponse.json({ ok: true, id });
  });
}
