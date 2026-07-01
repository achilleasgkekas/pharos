import { NextRequest, NextResponse } from 'next/server';
import { withAuth, apiError } from '@/lib/apiAuth';
import { isObjectId, readBody } from '@/lib/apiBody';
import { connectDB } from '@/lib/db';
import { Store } from '@/models/Store';
import { invalidateStoreCache } from '@/lib/storeService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function cleanAliases(raw: unknown): string[] {
  const parts = Array.isArray(raw)
    ? raw.map(String)
    : typeof raw === 'string'
      ? raw.split(',')
      : [];
  return parts.map((a) => a.trim().toLowerCase()).filter(Boolean);
}

/** PATCH /api/v1/stores/:id  { name?, url?, aliases? } → update a store. Mirrors web saveStore (edit branch). */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(req, async () => {
    const { id } = await params;
    if (!isObjectId(id)) return apiError('bad id');
    const b = await readBody(req);
    const set: Record<string, unknown> = { auto: false };
    if (typeof b.name === 'string') {
      const name = b.name.trim();
      if (!name) return apiError('name cannot be empty');
      set.name = name;
    }
    if (typeof b.url === 'string') set.url = b.url.trim();
    if (b.aliases !== undefined) set.aliases = cleanAliases(b.aliases);
    await connectDB();
    try {
      const doc = await Store.findByIdAndUpdate(id, { $set: set }, { new: true }).lean();
      if (!doc) return apiError('not found', 404);
      invalidateStoreCache();
      return NextResponse.json({ ok: true, id });
    } catch {
      return apiError('A store with that name already exists');
    }
  });
}

/** DELETE /api/v1/stores/:id → permanent removal. Stores are not soft-deleted (mirrors web deleteStore). */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(req, async () => {
    const { id } = await params;
    if (!isObjectId(id)) return apiError('bad id');
    await connectDB();
    const doc = await Store.findByIdAndDelete(id).lean();
    if (!doc) return apiError('not found', 404);
    invalidateStoreCache();
    return NextResponse.json({ ok: true, id });
  });
}
