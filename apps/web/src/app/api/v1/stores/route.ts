import { NextRequest, NextResponse } from 'next/server';
import { withAuth, apiError } from '@/lib/apiAuth';
import { readBody, strField } from '@/lib/apiBody';
import { connectDB } from '@/lib/db';
import { Store } from '@/models/Store';
import { getStores, invalidateStoreCache } from '@/lib/storeService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Normalise an aliases input (array of strings, or a comma-separated string). */
function cleanAliases(raw: unknown): string[] {
  const parts = Array.isArray(raw)
    ? raw.map(String)
    : typeof raw === 'string'
      ? raw.split(',')
      : [];
  return parts.map((a) => a.trim().toLowerCase()).filter(Boolean);
}

/** GET /api/v1/stores → all stores (seeded on first use), sorted by name. */
export async function GET(req: NextRequest) {
  return withAuth(req, async () => {
    const stores = await getStores();
    return NextResponse.json({
      stores: stores.map((s) => ({ id: s._id, name: s.name, url: s.url ?? '', aliases: s.aliases ?? [], auto: s.auto ?? false })),
    });
  });
}

/** POST /api/v1/stores  { name, url?, aliases? } → create a store. Mirrors web saveStore. */
export async function POST(req: NextRequest) {
  return withAuth(req, async () => {
    const b = await readBody(req);
    const name = strField(b, 'name', '', true);
    if (!name) return apiError('name required');
    const url = strField(b, 'url', '', true);
    const aliases = cleanAliases(b.aliases);
    await connectDB();
    try {
      const doc = await Store.create({ name, url, aliases: aliases.length ? aliases : [name.toLowerCase()], auto: false });
      invalidateStoreCache();
      return NextResponse.json(
        { store: { id: String(doc._id), name: doc.name, url: doc.url ?? '', aliases: doc.aliases ?? [], auto: false } },
        { status: 201 }
      );
    } catch {
      return apiError('A store with that name already exists');
    }
  });
}
