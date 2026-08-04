import { NextRequest, NextResponse } from 'next/server';
import { withAuth, apiError } from '@/lib/apiAuth';
import { isObjectId, readBody } from '@/lib/apiBody';
import { getNotifications, markNotificationRead, markAllNotificationsRead } from '@/app/notifications/actions';
import { getAppSettings } from '@/lib/appSettings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/v1/notifications → { currency, items: [{ _id, kind, title, body, href, read, createdAt }], unread }.
 *  Surfaces the live alert feed (deals / installments / warranties / system), newest-unread first.
 *  `currency` lets API clients format the pipe-delimited money amounts baked into `body`
 *  (mirrors the same additive field on GET /api/v1/calendar). */
export async function GET(req: NextRequest) {
  return withAuth(req, async () => {
    const [feed, settings] = await Promise.all([getNotifications(), getAppSettings()]);
    return NextResponse.json({ currency: settings.currency || 'EUR', ...feed });
  });
}

/** PATCH /api/v1/notifications  { id } → mark one read; no id → mark all read. */
export async function PATCH(req: NextRequest) {
  return withAuth(req, async () => {
    const b = await readBody(req);
    if (typeof b.id === 'string' && b.id) {
      if (!isObjectId(b.id)) return apiError('bad id');
      await markNotificationRead(b.id);
    } else {
      await markAllNotificationsRead();
    }
    return NextResponse.json({ ok: true });
  });
}
