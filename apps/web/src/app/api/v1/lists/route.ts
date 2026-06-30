import { NextRequest, NextResponse } from 'next/server';
import { withAuth, apiError } from '@/lib/apiAuth';
import { getListsForEditor, saveList } from '@/app/settings/actions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/v1/lists → editable category taxonomies (current values + defaults). */
export async function GET(req: NextRequest) {
  return withAuth(req, async () => {
    const lists = await getListsForEditor();
    return NextResponse.json({ lists });
  });
}

/** PATCH /api/v1/lists  { key, values[] } → overwrite one taxonomy. Empty/identical-to-default clears the override. */
export async function PATCH(req: NextRequest) {
  return withAuth(req, async () => {
    const b = (await req.json().catch(() => ({}))) as { key?: unknown; values?: unknown };
    const key = typeof b.key === 'string' ? b.key : '';
    if (!key) return apiError('key required');
    const values = Array.isArray(b.values) ? b.values.map(String) : [];
    const r = await saveList(key, values);
    if (!r.ok) return apiError('unknown list key');
    return NextResponse.json({ ok: true });
  });
}
