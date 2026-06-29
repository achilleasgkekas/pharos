import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/apiAuth';
import { connectDB } from '@/lib/db';
import { Subscription } from '@/models/Subscription';
import { Voucher } from '@/models/Voucher';
import { Item } from '@/models/Item';
import { getAppSettings } from '@/lib/appSettings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Event = { date: string; kind: 'renewal' | 'voucher' | 'warranty'; label: string; amount?: number };

/** GET /api/v1/calendar?days=120 → upcoming agenda (subscription renewals, voucher
 *  expiries, warranty expiries) within the window, sorted by date. */
export async function GET(req: NextRequest) {
  return withAuth(req, async () => {
    await connectDB();
    const days = Math.min(Math.max(parseInt(new URL(req.url).searchParams.get('days') || '120', 10) || 120, 7), 365);
    const now = new Date();
    const horizon = new Date(now.getTime() + days * 86400000);
    const [subs, vouchers, items, settings] = await Promise.all([
      Subscription.find({ active: true, nextRenewal: { $gte: now, $lte: horizon } }).select('name amount nextRenewal').lean(),
      Voucher.find({ used: { $ne: true }, expiresAt: { $gte: now, $lte: horizon } }).select('title expiresAt').lean(),
      Item.find({ warrantyUntil: { $gte: now, $lte: horizon } }).select('title warrantyUntil').lean(),
      getAppSettings(),
    ]);
    const events: Event[] = [];
    for (const sub of subs as { name?: string; amount?: number; nextRenewal?: Date }[]) {
      if (sub.nextRenewal) events.push({ date: new Date(sub.nextRenewal).toISOString(), kind: 'renewal', label: sub.name || 'Subscription', amount: sub.amount });
    }
    for (const v of vouchers as { title?: string; expiresAt?: Date }[]) {
      if (v.expiresAt) events.push({ date: new Date(v.expiresAt).toISOString(), kind: 'voucher', label: v.title || 'Voucher' });
    }
    for (const it of items as { title?: string; warrantyUntil?: Date }[]) {
      if (it.warrantyUntil) events.push({ date: new Date(it.warrantyUntil).toISOString(), kind: 'warranty', label: it.title || 'Item' });
    }
    events.sort((a, b) => a.date.localeCompare(b.date));
    return NextResponse.json({ currency: settings.currency || 'EUR', days, events });
  });
}
