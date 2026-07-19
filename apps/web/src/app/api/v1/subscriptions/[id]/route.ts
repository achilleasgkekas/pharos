import { NextRequest, NextResponse } from 'next/server';
import { withAuth, apiError } from '@/lib/apiAuth';
import { isObjectId, readBody } from '@/lib/apiBody';
import { connectDB } from '@/lib/db';
import { Subscription } from '@/models/Subscription';
import { trim, type SubLean } from '../route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CYCLES = ['monthly', 'yearly', 'quarterly', 'weekly', 'lifetime'];

/** PATCH /api/v1/subscriptions/:id  { name?, amount?, billingCycle?, nextRenewal?, category?, active?, trialEndsAt?, firstChargeAmount? }
 *  trialEndsAt: an ISO date string sets it, `null` explicitly clears it (trial converted/cancelled). */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(req, async () => {
    const { id } = await params;
    if (!isObjectId(id)) return apiError('bad id');
    const b = await readBody(req);
    const set: Record<string, unknown> = {};
    if (typeof b.name === 'string' && b.name.trim()) set.name = b.name.trim();
    if (b.amount != null && Number.isFinite(Number(b.amount))) set.amount = Number(b.amount);
    if (typeof b.billingCycle === 'string' && CYCLES.includes(b.billingCycle)) set.billingCycle = b.billingCycle;
    if (typeof b.category === 'string') set.category = b.category;
    if (typeof b.active === 'boolean') set.active = b.active;
    if (b.nextRenewal) { const d = new Date(String(b.nextRenewal)); if (!Number.isNaN(d.getTime())) set.nextRenewal = d; }
    if (b.trialEndsAt === null) set.trialEndsAt = null;
    else if (b.trialEndsAt) { const d = new Date(String(b.trialEndsAt)); if (!Number.isNaN(d.getTime())) set.trialEndsAt = d; }
    if (b.firstChargeAmount != null && Number.isFinite(Number(b.firstChargeAmount))) set.firstChargeAmount = Number(b.firstChargeAmount);
    if (!Object.keys(set).length) return apiError('no valid fields');
    await connectDB();
    const doc = await Subscription.findByIdAndUpdate(id, { $set: set }, { new: true }).lean();
    if (!doc) return apiError('not found', 404);
    // Spec: PATCH returns { subscription: Subscription } (the updated doc), same trim as the list route.
    return NextResponse.json({ subscription: trim(doc as SubLean) });
  });
}

/** DELETE /api/v1/subscriptions/:id → soft-delete (recoverable from Trash). */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(req, async () => {
    const { id } = await params;
    if (!isObjectId(id)) return apiError('bad id');
    await connectDB();
    const doc = await Subscription.findByIdAndUpdate(id, { $set: { deletedAt: new Date() } }, { new: true }).lean();
    if (!doc) return apiError('not found', 404);
    return NextResponse.json({ ok: true, id });
  });
}
