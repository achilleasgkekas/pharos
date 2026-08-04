import { NextRequest, NextResponse } from 'next/server';
import { withAuth, apiError } from '@/lib/apiAuth';
import { isObjectId, readBody } from '@/lib/apiBody';
import { connectDB } from '@/lib/db';
import { LoyaltyCard as LoyaltyCardModel } from '@/models/LoyaltyCard';
import { currentModel } from '@/lib/tenancy/connection';
import { isBarcodeFormat, guessBarcodeFormat } from '@/lib/loyaltyCard';
import { trim, type LoyaltyCardLean } from '../route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** PATCH /api/v1/loyaltycards/:id  { title?, store?, cardNumber?, barcodeFormat?, notes?, archived? }
 *  Plain field edits only (no subarray, unlike GiftCard/Goal). `barcodeFormat` is only touched
 *  when it's an EXPLICIT valid format (isBarcodeFormat) — set verbatim regardless of cardNumber —
 *  or when `cardNumber` itself changes with no explicit format given, in which case it's
 *  re-guessed from the new number's shape (mirrors the web updateLoyaltyCard action's always-
 *  resolve behaviour, but scoped so a bogus/missing format never overwrites a good stored one
 *  using a cardNumber we didn't just receive). */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(req, async () => {
    const { id } = await params;
    if (!isObjectId(id)) return apiError('bad id');
    const b = await readBody(req);
    const set: Record<string, unknown> = {};
    if (typeof b.title === 'string' && b.title.trim()) set.title = b.title.trim();
    if (typeof b.store === 'string') set.store = b.store.trim();
    if (typeof b.cardNumber === 'string' && b.cardNumber.trim()) set.cardNumber = b.cardNumber.trim();
    if (typeof b.notes === 'string') set.notes = b.notes.trim();
    if (typeof b.archived === 'boolean') set.archived = b.archived;
    if (isBarcodeFormat(b.barcodeFormat)) set.barcodeFormat = b.barcodeFormat;
    else if (typeof set.cardNumber === 'string') set.barcodeFormat = guessBarcodeFormat(set.cardNumber);
    if (!Object.keys(set).length) return apiError('no valid fields');

    await connectDB();
    const LoyaltyCard = await currentModel(LoyaltyCardModel);
    const doc = await LoyaltyCard.findByIdAndUpdate(id, { $set: set }, { new: true }).lean();
    if (!doc) return apiError('not found', 404);
    return NextResponse.json({ loyaltyCard: trim(doc as LoyaltyCardLean) });
  });
}

/** DELETE /api/v1/loyaltycards/:id → soft-delete (recoverable from Trash). */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(req, async () => {
    const { id } = await params;
    if (!isObjectId(id)) return apiError('bad id');
    await connectDB();
    const LoyaltyCard = await currentModel(LoyaltyCardModel);
    const doc = await LoyaltyCard.findByIdAndUpdate(id, { $set: { deletedAt: new Date() } }, { new: true }).lean();
    if (!doc) return apiError('not found', 404);
    return NextResponse.json({ ok: true, id });
  });
}
