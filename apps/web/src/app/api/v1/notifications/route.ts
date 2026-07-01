import { NextRequest, NextResponse } from 'next/server';
import { withAuth, apiError } from '@/lib/apiAuth';
import { readBody } from '@/lib/apiBody';
import { getNotifications, markNotificationRead, markAllNotificationsRead } from '@/app/notifications/actions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/v1/notifications → { items: [{ _id, kind, title, body, href, read, createdAt }], unread }.
 *  Surfaces the live alert feed (deals / installments / warranties / system), newest-unread first. */
export async function GET(req: NextRequest) {
  return withAuth(req, async () => {
    return NextResponse.json(await getNotifications());
  });
}

/** PATCH /api/v1/notifications  { id } → mark one read; no id → mark all read. */
export async function PATCH(req: NextRequest) {
  return withAuth(req, async () => {
    const b = await readBody(req);
    if (typeof b.id === 'string' && b.id) {
      if (!/^[a-f0-9]{24}$/i.test(b.id)) return apiError('bad id');
      await markNotificationRead(b.id);
    } else {
      await markAllNotificationsRead();
    }
    return NextResponse.json({ ok: true });
  });
}
