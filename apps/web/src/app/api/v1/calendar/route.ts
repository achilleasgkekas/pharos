import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/apiAuth';
import { computeMoneyAgenda } from '@/lib/moneyAgenda';
import { getAppSettings } from '@/lib/appSettings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/v1/calendar → 3-month money agenda mirroring the web /calendar page:
 *  subscription renewals (stepped per cycle), card installments aggregated per
 *  month, recurring bills/income projected, warranty + voucher expiries, plus
 *  per-month in/out totals. A flat `events` array is kept for backward compat. */
export async function GET(req: NextRequest) {
  return withAuth(req, async () => {
    const [{ months, dueThisMonth }, settings] = await Promise.all([computeMoneyAgenda(), getAppSettings()]);

    // Flat events kept for backward compatibility (renewal/voucher/warranty only).
    const events = months
      .flatMap((m) => m.entries)
      .filter((e) => e.kind === 'renewal' || e.kind === 'voucher' || e.kind === 'warranty')
      .map((e) => ({ date: e.date, kind: e.kind as 'renewal' | 'voucher' | 'warranty', label: e.label, amount: e.amount ?? undefined }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return NextResponse.json({ currency: settings.currency || 'EUR', dueThisMonth, months, events });
  });
}
