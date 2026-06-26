import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/apiAuth';
import { toggleListItem, updateListItem, deleteListItem } from '@/app/shopping-list/actions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** PATCH /api/v1/shopping-list/:id  { checked?, name?, quantity?, category?, brand?, note? } */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuth(req, async () => {
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    if (typeof b.checked === 'boolean') await toggleListItem(id, b.checked);
    const fields: Record<string, string> = {};
    for (const k of ['name', 'quantity', 'category', 'brand', 'note']) {
      if (typeof b[k] === 'string') fields[k] = b[k] as string;
    }
    if (Object.keys(fields).length) await updateListItem(id, fields);
    return NextResponse.json({ ok: true });
  });
}

/** DELETE /api/v1/shopping-list/:id */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuth(req, async () => {
    await deleteListItem(id);
    return NextResponse.json({ ok: true });
  });
}
