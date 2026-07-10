import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { User } from '@/models/User';
import { computeMoneyAgenda } from '@/lib/moneyAgenda';
import { getAppSettings } from '@/lib/appSettings';
import { agendaToIcsEvents, buildIcsCalendar } from '@/lib/ics';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/calendar.ics?token=<calendarToken> → read-only iCal (RFC 5545) feed of the
 *  3-month money agenda (subscription renewals, installments, recurring bills/income,
 *  warranty + voucher expiries), for subscribing from Google / Apple / Outlook Calendar.
 *  The token rides in the URL because calendar clients cannot send an Authorization
 *  header. It is a dedicated LOW-SCOPE, revocable feed secret (User.calendarToken),
 *  NOT the full API bearer token — leaking a subscribe URL never grants API access. */
export async function GET(req: NextRequest) {
  const token = (req.nextUrl.searchParams.get('token') || '').trim();
  if (!token) return new NextResponse('Missing token', { status: 401 });

  await connectDB();
  const user = await User.findOne({ calendarToken: token }).select('_id').lean();
  if (!user) return new NextResponse('Invalid or revoked token', { status: 401 });

  const [{ months }, settings] = await Promise.all([computeMoneyAgenda(), getAppSettings()]);
  const events = agendaToIcsEvents(months, settings.currency || 'EUR');
  const body = buildIcsCalendar(events, {
    name: 'Pharos · Money',
    description: 'Upcoming subscription renewals, installments, bills, and warranty / voucher expiries.',
    dtstamp: new Date(),
    ttlHours: 12,
  });

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="pharos.ics"',
      'Cache-Control': 'private, max-age=0, no-store',
    },
  });
}
