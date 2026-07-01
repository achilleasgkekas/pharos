import { NextRequest, NextResponse } from 'next/server';
import { withAuth, apiError } from '@/lib/apiAuth';
import { isObjectId, readBody } from '@/lib/apiBody';
import { toggleListItem, updateListItem, deleteListItem } from '@/app/shopping-list/actions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** PATCH /api/v1/shopping-list/:id  { checked?, name?, quantity?, category?, brand?, note? } */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuth(req, async () => {
    if (!isObjectId(id)) return apiError('bad id');
    const b = await readBody(req);
    const fields: Record<string, string> = {};
    for (const k of ['name', 'quantity', 'category', 'brand', 'note']) {
      if (typeof b[k] === 'string') fields[k] = b[k] as string;
    }
    const hasChecked = typeof b.checked === 'boolean';
    const hasFields = Object.keys(fields).length > 0;
    if (!hasChecked && !hasFields) return apiError('no valid fields');
    // Both ops target the same id, so found is consistent; surface 404 if no live doc matched.
    let found = true;
    if (hasChecked && !(await toggleListItem(id, b.checked as boolean)).found) found = false;
    if (hasFields && !(await updateListItem(id, fields)).found) found = false;
    if (!found) return apiError('not found', 404);
    return NextResponse.json({ ok: true });
  });
}

/** DELETE /api/v1/shopping-list/:id */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuth(req, async () => {
    if (!isObjectId(id)) return apiError('bad id');
    if (!(await deleteListItem(id)).found) return apiError('not found', 404);
    return NextResponse.json({ ok: true });
  });
}
