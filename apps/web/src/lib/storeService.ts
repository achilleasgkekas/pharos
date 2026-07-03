import { connectDB } from './db';
import { Store } from '@/models/Store';
import { KNOWN_STORES } from './stores';
import { getAppSettings } from './appSettings';

export type StoreLite = { _id?: string; name: string; aliases: string[]; url?: string; auto?: boolean };

let cache: { v: StoreLite[]; t: number } | null = null;
const TTL = 10000;

/** All stores. Seeds the collection from the curated list on first use. */
export async function getStores(): Promise<StoreLite[]> {
  if (cache && Date.now() - cache.t < TTL) return cache.v;
  await connectDB();
  let docs = await Store.find().sort({ name: 1 }).lean();
  if (docs.length === 0) {
    try {
      await Store.insertMany(
        KNOWN_STORES.map((s) => ({ name: s.name, aliases: s.aliases, url: s.url ?? '', auto: false })),
        { ordered: false }
      );
    } catch {
      /* race / duplicate on concurrent seed */
    }
    docs = await Store.find().sort({ name: 1 }).lean();
  }
  const v: StoreLite[] = docs.map((d) => ({
    _id: String(d._id),
    name: d.name,
    aliases: d.aliases ?? [],
    url: d.url ?? '',
    auto: d.auto ?? false,
  }));
  cache = { v, t: Date.now() };
  return v;
}

export function invalidateStoreCache(): void {
  cache = null;
}

/** Names only — for AI prompt hints and dropdowns. */
export async function getStoreNames(): Promise<string[]> {
  return (await getStores()).map((s) => s.name);
}

/**
 * Match a raw store name against a list of known stores (exact name/alias, or
 * substring in either direction for meaningful lengths). Exported for testing —
 * `resolveStore` calls it with the DB-backed store list.
 */
export function matchIn(raw: string, stores: StoreLite[]): string | null {
  const q = (raw || '').toLowerCase().trim();
  if (!q) return null;
  for (const s of stores) {
    if (s.name.toLowerCase() === q) return s.name;
    for (const a of s.aliases) {
      const al = a.toLowerCase();
      if (q === al) return s.name;
      // Substring only for meaningful lengths (avoid short aliases matching noise)
      if (al.length >= 4 && q.includes(al)) return s.name;
      if (q.length >= 4 && al.includes(q)) return s.name;
    }
  }
  return null;
}

/**
 * Match a raw store name to a known one. If unknown, ADD it to the list (D4) so
 * it's available next time and visible (flagged auto) in the management UI.
 */
export async function resolveStore(raw: string): Promise<string> {
  const cleaned = (raw || '').trim();
  if (!cleaned) return '';
  const stores = await getStores();
  const match = matchIn(cleaned, stores);
  if (match) return match;
  const name = cleaned.slice(0, 80);
  // Honor the "auto-add unknown stores" setting — when off, use the name but don't
  // grow the managed list (keeps it curated).
  const { autoAddStores } = await getAppSettings();
  if (autoAddStores) {
    try {
      await connectDB();
      await Store.create({ name, aliases: [name.toLowerCase()], auto: true });
      invalidateStoreCache();
    } catch {
      /* duplicate-name race — fine, it exists now */
    }
  }
  return name;
}
