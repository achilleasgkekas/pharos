'use server';
import { cur } from "@/lib/money";
import { connectDB } from '@/lib/db';
import { Item } from '@/models/Item';
import { Receipt } from '@/models/Receipt';
import { Statement } from '@/models/Statement';
import { Task } from '@/models/Task';
import { fetchPageText } from '@/lib/scrape';
import { parseProductFromPage } from '@/lib/ollama';
import { searchWeb, searchImages } from '@/lib/search';
import { type ItemView } from '@/lib/itemStatus';
import { saveFile, deleteFile } from '@/lib/storage';
import { revalidatePath } from 'next/cache';
import { safeRevalidate } from '@/lib/revalidate';
import { Types } from 'mongoose';
import { z } from 'zod';
import type { SerializedItem } from '@/types';

const CATEGORIES = ['network', 'storage', 'compute', 'audio', 'video', 'mobile', 'peripheral', 'consumable', 'other'] as const;
const STATUSES = ['researching', 'decided', 'ordered', 'received', 'installed', 'deferred', 'sold', 'broken'] as const;

const ItemFormSchema = z.object({
  title: z.string().min(1, 'Title required'),
  // Free string (not z.enum) so custom categories from Settings → Lists save fine.
  category: z.string().default('other'),
  status: z.enum(STATUSES).default('researching'),
  currentPrice: z.coerce.number().min(0).default(0),
  purchasedPrice: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? null : Number(v)),
    z.number().nullable().default(null)
  ),
  targetPrice: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? null : Number(v)),
    z.number().nullable().default(null)
  ),
  purchasedFrom: z.string().default(''),
  specs: z.string().default(''),
  notes: z.string().default(''),
  tags: z.string().default(''),
  serialNumber: z.string().default(''),
  location: z.string().default(''),
  num: z.string().default(''),
  links: z.string().default('[]'), // JSON-encoded [{label,url}]
});

function parseTags(raw: string): string[] {
  return raw.split(',').map((t) => t.trim()).filter(Boolean);
}

function parseLinks(raw: string): { label: string; url: string; price: number | null }[] {
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((l) => l && typeof l.url === 'string' && l.url.trim())
      .map((l) => {
        const n = Number(l.price);
        return {
          label: String(l.label || 'Link').trim(),
          url: String(l.url).trim(),
          price: Number.isFinite(n) && n > 0 ? n : null,
        };
      });
  } catch {
    return [];
  }
}

export async function createItem(formData: FormData) {
  const raw = Object.fromEntries(formData);
  const { links, tags, ...rest } = ItemFormSchema.parse(raw);
  await connectDB();
  await Item.create({
    ...rest,
    tags: parseTags(tags),
    links: parseLinks(links),
  });
  revalidatePath('/items');
}

export async function updateItem(id: string, formData: FormData) {
  const raw = Object.fromEntries(formData);
  const { links, tags, ...rest } = ItemFormSchema.parse(raw);
  await connectDB();
  await Item.findByIdAndUpdate(id, {
    ...rest,
    tags: parseTags(tags),
    links: parseLinks(links),
  });
  revalidatePath('/items');
}

export async function deleteItem(id: string) {
  await connectDB();
  // Soft delete → Trash (Settings → Storage & data). Receipt/statement links stay
  // intact so a restore is lossless; purging from the Trash clears them for real.
  await Item.updateOne({ _id: id }, { $set: { deletedAt: new Date() } });

  revalidatePath('/items');
  revalidatePath('/shopping');
  revalidatePath('/receipts');
  revalidatePath('/statements');
}

// ─── Product photos ──────────────────────────────────────────────────────

const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic']);

/** Upload one or more product photos (stored in the equipment bucket). */
export async function uploadItemPhotos(
  itemId: string,
  formData: FormData
): Promise<{ ok: boolean; added: number; photos: string[]; error?: string }> {
  const files = formData.getAll('files').filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { ok: false, added: 0, photos: [], error: 'No image found' };

  await connectDB();
  const item = await Item.findById(itemId);
  if (!item) return { ok: false, added: 0, photos: [], error: 'Item not found' };

  let added = 0;
  for (const file of files) {
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    if (!IMAGE_EXTS.has(ext)) continue;
    const bytes = Buffer.from(await file.arrayBuffer());
    const { relativePath } = await saveFile('equipment', bytes, ext);
    item.photos.push(relativePath);
    added++;
  }
  if (added > 0) await item.save();

  revalidatePath('/items');
  revalidatePath('/shopping');
  return { ok: added > 0, added, photos: [...item.photos], error: added === 0 ? 'Unsupported image type' : undefined };
}

/** Remove a product photo (and delete the underlying file). */
export async function deleteItemPhoto(itemId: string, relativePath: string): Promise<{ ok: boolean; photos: string[] }> {
  await connectDB();
  const item = await Item.findById(itemId);
  if (!item) return { ok: false, photos: [] };
  item.photos = item.photos.filter((p) => p !== relativePath);
  await item.save();
  try {
    await deleteFile(relativePath);
  } catch {
    /* file already gone */
  }
  revalidatePath('/items');
  revalidatePath('/shopping');
  return { ok: true, photos: [...item.photos] };
}

/** Make a photo the cover (move it to the front of the gallery). */
export async function setItemCover(itemId: string, relativePath: string): Promise<{ ok: boolean; photos: string[] }> {
  await connectDB();
  const item = await Item.findById(itemId);
  if (!item) return { ok: false, photos: [] };
  item.photos = [relativePath, ...item.photos.filter((p) => p !== relativePath)];
  await item.save();
  revalidatePath('/items');
  revalidatePath('/shopping');
  return { ok: true, photos: [...item.photos] };
}

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

/** Pull canonical product image URLs out of a page's HTML. */
function extractImageUrls(html: string, baseUrl: string): string[] {
  const urls = new Set<string>();
  const add = (u?: string) => {
    if (!u) return;
    try {
      urls.add(new URL(u.trim(), baseUrl).href);
    } catch {
      /* ignore bad url */
    }
  };

  // og:image / twitter:image (content can come before or after the property attr)
  const metaRe = /<meta[^>]+(?:property|name)=["'](?:og:image(?::secure_url)?|twitter:image(?::src)?)["'][^>]*content=["']([^"']+)["']/gi;
  const metaRe2 = /<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["'](?:og:image|twitter:image)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = metaRe.exec(html))) add(m[1]);
  while ((m = metaRe2.exec(html))) add(m[1]);

  // schema.org JSON-LD image fields (string | array | {url})
  const ldRe = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  const walk = (node: unknown) => {
    if (!node) return;
    if (Array.isArray(node)) return node.forEach(walk);
    if (typeof node === 'object') {
      const o = node as Record<string, unknown>;
      if (o.image) {
        if (typeof o.image === 'string') add(o.image);
        else if (Array.isArray(o.image)) o.image.forEach((x) => (typeof x === 'string' ? add(x) : walk(x)));
        else walk(o.image);
      }
      if (typeof o.url === 'string' && /\.(jpe?g|png|webp)/i.test(o.url)) add(o.url);
      Object.values(o).forEach(walk);
    }
  };
  while ((m = ldRe.exec(html))) {
    try {
      walk(JSON.parse(m[1].trim()));
    } catch {
      /* malformed ld+json */
    }
  }

  return [...urls].slice(0, 8);
}

type WithPhotos = { photos: string[] };

/** Read a page, extract its product images, download up to `max` and push their
 *  paths onto `item.photos`. Mutates the doc; the caller is responsible for save.
 *  Returns how many were attached. */
async function attachImagesFromUrl(item: WithPhotos, url: string, max = 4): Promise<number> {
  let html: string;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html' },
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return 0;
    html = await res.text();
  } catch {
    return 0;
  }

  let added = 0;
  for (const imgUrl of extractImageUrls(html, url)) {
    if (added >= max) break;
    try {
      const ir = await fetch(imgUrl, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) });
      if (!ir.ok) continue;
      const ct = (ir.headers.get('content-type') || '').toLowerCase();
      if (!ct.startsWith('image/')) continue;
      const buf = Buffer.from(await ir.arrayBuffer());
      if (buf.length < 3000) continue; // skip 1px trackers / placeholders
      let ext = ct.split('/')[1]?.split(';')[0] || 'jpg';
      if (ext === 'jpeg') ext = 'jpg';
      if (ext === 'svg+xml') continue;
      const { relativePath } = await saveFile('equipment', buf, ext);
      item.photos.push(relativePath);
      added++;
    } catch {
      /* skip this image */
    }
  }
  return added;
}

/** Download ONE direct image URL (e.g. from image search) and attach it. */
async function attachOneImage(item: WithPhotos, imgUrl: string): Promise<boolean> {
  try {
    const ir = await fetch(imgUrl, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) });
    if (!ir.ok) return false;
    const ct = (ir.headers.get('content-type') || '').toLowerCase();
    if (!ct.startsWith('image/')) return false;
    const buf = Buffer.from(await ir.arrayBuffer());
    if (buf.length < 3000) return false; // skip trackers/placeholders
    let ext = ct.split('/')[1]?.split(';')[0] || 'jpg';
    if (ext === 'jpeg') ext = 'jpg';
    if (ext === 'svg+xml') return false;
    const { relativePath } = await saveFile('equipment', buf, ext);
    item.photos.push(relativePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Auto-fetch product photos from the item's link: read the page, pull the
 * canonical product images (og:image / JSON-LD), download and attach them.
 */
export async function fetchItemPhotosFromUrl(
  itemId: string
): Promise<{ ok: boolean; added: number; photos: string[]; error?: string }> {
  await connectDB();
  const item = await Item.findById(itemId);
  if (!item) return { ok: false, added: 0, photos: [], error: 'Item not found' };

  const link = (item.links ?? []).find((l) => l.url && /^https?:\/\//i.test(l.url));
  if (!link) return { ok: false, added: 0, photos: [...item.photos], error: 'This product has no link to fetch from' };

  const added = await attachImagesFromUrl(item, link.url!, 4);
  if (added > 0) await item.save();
  revalidatePath('/items');
  revalidatePath('/shopping');
  return { ok: added > 0, added, photos: [...item.photos], error: added === 0 ? 'Could not find/download images' : undefined };
}

/**
 * AI-fill: read every product link the item has, run each page through the
 * vision/text model, and fill in whatever it finds — empty specs, category, a
 * better title, product photos, and a fresh price per store-link (also appended
 * to the price history so the chart updates). Never clobbers fields you've set.
 */
/**
 * Does a parsed product page actually describe THIS item? Quick/seed links are
 * often bare domains (aliexpress.com, amazon.de) and web-search can surface an
 * unrelated product; without this guard aiFillItem would overwrite the item with
 * a wrong price/specs/tags (e.g. an ultrasonic jewelry cleaner for a "Fenvi
 * AQC113" NIC). We require at least one distinctive token (brand or model number)
 * from the item title to appear in the parsed product.
 */
function productMatchesItem(
  itemTitle: string,
  parsed: { title?: string; specs?: string; store?: string }
): boolean {
  const norm = (s: string) => ` ${(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()} `;
  const hay = norm(`${parsed.title ?? ''} ${parsed.specs ?? ''} ${parsed.store ?? ''}`);
  const STOP = new Set([
    'with', 'for', 'and', 'the', 'mini', 'pro', 'plus', 'max', 'wifi', 'black', 'white',
    'cable', 'module', 'adapter', 'card', 'combo', 'nvme', 'ssd', 'usb',
  ]);
  const tokens = norm(itemTitle)
    .trim()
    .split(' ')
    .filter((t) => t && !STOP.has(t) && (/\d/.test(t) || t.length >= 4));
  if (tokens.length === 0) return true; // nothing distinctive to check — don't block
  return tokens.some((t) => hay.includes(t));
}

export async function aiFillItem(itemId: string): Promise<{
  ok: boolean;
  checked: number;
  filled: string[];
  lowest: number | null;
  item?: SerializedItem;
  error?: string;
}> {
  await connectDB();
  const item = await Item.findById(itemId);
  if (!item) return { ok: false, checked: 0, filled: [], lowest: null, error: 'Item not found' };

  const hostOf = (u: string) => {
    try {
      return new URL(u).hostname.replace(/^www\./, '');
    } catch {
      return 'Source';
    }
  };

  // Pages to read: the item's existing links, or — if it has none — the top
  // web-search hits for its title (C3: AI fill without a link, via SearXNG).
  type Target = { url: string; existing?: (typeof item.links)[number] };
  let targets: Target[] = (item.links ?? [])
    .filter((l) => l.url && /^https?:\/\//i.test(l.url))
    .map((l) => ({ url: l.url!, existing: l }));
  let webDiscovered = false;

  if (targets.length === 0) {
    const q = `${item.title} ${item.category !== 'other' ? item.category : ''}`.trim();
    const results = await searchWeb(q, 8);
    targets = results
      .filter((r) => /^https?:\/\//i.test(r.url) && !/youtube|facebook|reddit|pinterest|instagram|tiktok/i.test(r.url))
      .slice(0, 3)
      .map((r) => ({ url: r.url }));
    webDiscovered = true;
  }

  const filled = new Set<string>();
  let lowest = Infinity;
  let fieldsDone = false;
  let okCount = 0;

  for (const t of targets) {
    let parsed;
    try {
      const page = await fetchPageText(t.url);
      parsed = (await parseProductFromPage(page)).parsed;
    } catch {
      continue; // skip pages that fail (bot-protection, 404, AI hiccup)
    }
    // Skip pages whose product doesn't match this item (bare-domain homepage or a
    // bad search hit) — better to fill nothing than to write garbage.
    if (!productMatchesItem(item.title, parsed)) continue;
    okCount++;
    const store = parsed.store || hostOf(t.url);
    const alreadyLinked = (item.links ?? []).some((l) => normUrl(l.url) === normUrl(t.url));

    if (parsed.price > 0) {
      if (t.existing) {
        t.existing.price = parsed.price;
      } else if (!alreadyLinked) {
        item.links.push({ label: store, url: t.url, price: parsed.price });
        filled.add('links');
      }
      item.priceHistory.push({ price: parsed.price, store, url: t.url, date: new Date() } as (typeof item.priceHistory)[number]);
      if (parsed.price < lowest) lowest = parsed.price;
      filled.add('prices');
    } else if (webDiscovered && !alreadyLinked) {
      // Keep the discovered product link even when no price was readable
      item.links.push({ label: store, url: t.url, price: null });
      filled.add('links');
    }

    // Fill only empty item-level fields, from the first page that parses
    if (!fieldsDone) {
      fieldsDone = true;
      if (!item.specs && parsed.specs) {
        item.specs = parsed.specs;
        filled.add('specs');
      }
      if (item.category === 'other' && parsed.category && parsed.category !== 'other') {
        item.category = parsed.category;
        filled.add('category');
      }
      // Tags: merge the AI's keyword tags with the user's, deduped, capped — additive
      // so we never drop tags the user set by hand.
      if (parsed.tags?.length) {
        const seen = new Set((item.tags ?? []).map((t) => t.toLowerCase()));
        for (const raw of parsed.tags) {
          const tag = raw.trim().toLowerCase().replace(/\s+/g, '-').slice(0, 24);
          if (tag && !seen.has(tag) && item.tags.length < 8) {
            item.tags.push(tag);
            seen.add(tag);
            filled.add('tags');
          }
        }
        if (filled.has('tags')) item.markModified('tags');
      }
    }
  }

  // Photos (C1): image search first (works with no link), then product-page images.
  // Only when a RELEVANT product page actually parsed (okCount>0) — otherwise we'd
  // attach images for an item whose product we couldn't even confirm (same garbage
  // risk as the field guard, e.g. bare-domain-only links).
  if (item.photos.length === 0 && okCount > 0) {
    let added = 0;
    for (const im of await searchImages(item.title, 6)) {
      if (added >= 3) break;
      if (await attachOneImage(item, im.imgSrc)) added++;
    }
    if (added === 0) {
      for (const t of targets) {
        const a = await attachImagesFromUrl(item, t.url, 4);
        if (a > 0) {
          added = a;
          break;
        }
      }
    }
    if (added > 0) filled.add('photos');
  }

  if (lowest < Infinity) {
    item.currentPrice = lowest;
    filled.add('currentPrice');
  }

  if (filled.size > 0) item.aiFilledAt = new Date();
  item.markModified('links');
  await item.save();
  safeRevalidate('/items');
  safeRevalidate('/shopping');

  const fresh = await Item.findById(itemId).lean();
  const found = okCount > 0 || filled.has('photos');
  return {
    ok: found,
    checked: targets.length,
    filled: [...filled],
    lowest: lowest < Infinity ? lowest : null,
    item: fresh ? (JSON.parse(JSON.stringify(fresh)) as SerializedItem) : undefined,
    error: found
      ? undefined
      : webDiscovered
        ? 'Web search found nothing usable for this title.'
        : 'Could not read any of the links (bot-protection or offline).',
  };
}

/**
 * Bulk "AI fill from web" — runs aiFillItem for a batch of ids, sequentially (each
 * does a web search + page fetch + AI parse, so running them in parallel would
 * hammer Ollama/SearXNG). Capped per call so one request can't run for many
 * minutes; the client loops over chunks until done and shows progress.
 */
export async function aiFillItemsBulk(
  itemIds: string[]
): Promise<{ ok: boolean; results: { id: string; ok: boolean; filled: string[]; error?: string }[] }> {
  const ids = itemIds.slice(0, 5); // bound wall-time per call (~5 × up-to-30s)
  const results: { id: string; ok: boolean; filled: string[]; error?: string }[] = [];
  for (const id of ids) {
    try {
      const r = await aiFillItem(id);
      results.push({ id, ok: r.ok, filled: r.filled, error: r.error });
    } catch (e) {
      results.push({ id, ok: false, filled: [], error: (e as Error).message.slice(0, 120) });
    }
  }
  return { ok: true, results };
}

/**
 * Fill/refresh ONLY the specs of an item from the web — reads its first link, or
 * (if it has none) the top web-search hit for its title, and overwrites specs.
 */
export async function aiFillSpecs(
  itemId: string
): Promise<{ ok: boolean; specs?: string; item?: SerializedItem; error?: string }> {
  await connectDB();
  const item = await Item.findById(itemId);
  if (!item) return { ok: false, error: 'Item not found' };

  let url = (item.links ?? []).find((l) => l.url && /^https?:\/\//i.test(l.url))?.url ?? undefined;
  if (!url) {
    const results = await searchWeb(`${item.title} specifications specs`, 6);
    url = results.find((r) => /^https?:\/\//i.test(r.url) && !/youtube|facebook|reddit|pinterest|instagram/i.test(r.url))?.url;
  }
  if (!url) return { ok: false, error: 'No source to read specs from' };

  let parsed;
  try {
    const page = await fetchPageText(url);
    parsed = (await parseProductFromPage(page)).parsed;
  } catch (err) {
    return { ok: false, error: `Failed to read the page: ${(err as Error).message.slice(0, 100)}` };
  }
  if (!parsed.specs) return { ok: false, error: 'No specs found on the page' };

  item.specs = parsed.specs;
  await item.save();
  revalidatePath('/items');
  revalidatePath('/shopping');
  const fresh = await Item.findById(itemId).lean();
  return { ok: true, specs: parsed.specs, item: fresh ? (JSON.parse(JSON.stringify(fresh)) as SerializedItem) : undefined };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Convert an item into a standalone task. Copies the product's URLs (and prices)
 * into the task's notes — no link back to the item, no mutation of the item.
 */
export async function convertItemToTask(itemId: string): Promise<{ ok: boolean; taskId?: string; error?: string }> {
  await connectDB();
  const item = await Item.findById(itemId).lean();
  if (!item) return { ok: false, error: 'Item not found' };

  const links = ((item.links ?? []) as { label?: string; url?: string; price?: number | null }[]).filter((l) => l.url);
  const linksHtml = links.length
    ? `<ul>${links
        .map((l) => {
          const u = escapeHtml(l.url || '');
          const label = escapeHtml(l.label || l.url || 'Link');
          const price = l.price ? ` — ${cur()}${l.price}` : '';
          return `<li><a href="${u}" target="_blank" rel="noopener noreferrer">${label}</a>${price}</li>`;
        })
        .join('')}</ul>`
    : '<p>(no links)</p>';
  const priceLine = item.currentPrice > 0 ? `<p>Price: <strong>${cur()}${item.currentPrice}</strong></p>` : '';
  const content = `<p>From product: <strong>${escapeHtml(item.title)}</strong></p>${priceLine}${linksHtml}`;

  const task = await Task.create({
    title: item.title,
    content,
    tags: ['shopping'],
    status: 'todo',
  });
  revalidatePath('/tasks');
  return { ok: true, taskId: String(task._id) };
}

export type ImportItemResult =
  | { ok: true; id: string; title: string; price: number; store: string; updated: boolean }
  | { ok: false; error: string };

/** Normalize a URL (host + path, no www/query/trailing slash) for matching. */
function normUrl(u: string): string {
  try {
    const url = new URL(u);
    return (url.hostname.replace(/^www\./, '') + url.pathname).replace(/\/+$/, '').toLowerCase();
  } catch {
    return (u || '').toLowerCase().trim();
  }
}

/** Normalize a product title for fuzzy matching. */
function normTitle(t: string): string {
  return (t || '').toLowerCase().replace(/[^a-z0-9α-ωά-ώ]+/gi, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Import a product from a URL via the local AI. If the link (or title) already
 * matches an item in the library, update that item with any missing info and
 * record the price instead of creating a duplicate.
 */
export async function importItemFromUrl(url: string, view: ItemView): Promise<ImportItemResult> {
  let page;
  try {
    page = await fetchPageText(url);
  } catch (err) {
    return { ok: false, error: `Page failed to load: ${(err as Error).message}` };
  }

  let parsed;
  try {
    parsed = (await parseProductFromPage(page)).parsed;
  } catch (err) {
    const msg = (err as Error).message || String(err);
    return {
      ok: false,
      error: /ECONNREFUSED|fetch failed|ENOTFOUND/i.test(msg) ? 'Ollama is not reachable' : `AI parse failed: ${msg.slice(0, 120)}`,
    };
  }

  const title = (parsed.title || page.title || url).slice(0, 200);
  const status = view === 'inventory' ? 'received' : 'researching';
  const store = parsed.store || (() => { try { return new URL(url).hostname; } catch { return 'Source'; } })();

  try {
    await connectDB();

    // Look for an existing item: first by a matching link URL, then by title.
    const targetUrl = normUrl(url);
    const targetTitle = normTitle(title);
    const all = await Item.find();
    let match = all.find((it) => (it.links ?? []).some((l) => l.url && normUrl(l.url) === targetUrl));
    if (!match && targetTitle.length >= 6) {
      match = all.find((it) => {
        const nt = normTitle(it.title);
        return nt.length >= 6 && (nt === targetTitle || nt.includes(targetTitle) || targetTitle.includes(nt));
      });
    }

    if (match) {
      // Fill only missing fields — never clobber what the user already set
      if (!match.specs && parsed.specs) match.specs = parsed.specs;
      if (match.category === 'other' && parsed.category && parsed.category !== 'other') match.category = parsed.category;
      const existingLink = (match.links ?? []).find((l) => l.url && normUrl(l.url) === targetUrl);
      if (existingLink) {
        if (parsed.price > 0) existingLink.price = parsed.price;
      } else {
        match.links.push({ label: store, url, price: parsed.price > 0 ? parsed.price : null });
      }
      match.markModified('links');
      // Keep tracking the price: append to history + refresh the current price
      if (parsed.price > 0) {
        match.priceHistory.push({ price: parsed.price, store, url, date: new Date() } as (typeof match.priceHistory)[number]);
        match.currentPrice = parsed.price;
      }
      // Grab product photos too, if it doesn't have any yet
      if (match.photos.length === 0) await attachImagesFromUrl(match, url);
      await match.save();
      revalidatePath('/items');
      revalidatePath('/shopping');
      return { ok: true, id: String(match._id), title: match.title, price: parsed.price, store, updated: true };
    }

    const item = await Item.create({
      title,
      category: parsed.category,
      status,
      currentPrice: parsed.price,
      specs: parsed.specs,
      links: [{ label: store, url, price: parsed.price > 0 ? parsed.price : null }],
      priceHistory: parsed.price > 0 ? [{ price: parsed.price, store, url, date: new Date() }] : [],
    });
    // Auto-fetch product photos from the same page
    const addedPhotos = await attachImagesFromUrl(item, url);
    if (addedPhotos > 0) await item.save();
    revalidatePath('/items');
    revalidatePath('/shopping');
    return { ok: true, id: String(item._id), title, price: parsed.price, store, updated: false };
  } catch (err) {
    return { ok: false, error: `DB error: ${(err as Error).message}` };
  }
}

// ─── Preview-then-approve import ─────────────────────────────────────────────
// The "New" import window fetches + AI-parses a URL, shows a PREVIEW, and only
// saves on approval — so one AI call (preview) covers the whole flow.

export type ItemPreview =
  | {
      ok: true;
      title: string;
      price: number;
      store: string;
      specs: string;
      category: string;
      existing: { id: string; title: string } | null;
    }
  | { ok: false; error: string };

/** Fetch + AI-parse a product URL WITHOUT saving (the preview step). */
export async function previewItemFromUrl(url: string): Promise<ItemPreview> {
  let page;
  try {
    page = await fetchPageText(url);
  } catch (err) {
    return { ok: false, error: `Page failed to load: ${(err as Error).message.slice(0, 120)}` };
  }
  let parsed;
  try {
    parsed = (await parseProductFromPage(page)).parsed;
  } catch (err) {
    const msg = (err as Error).message || String(err);
    return {
      ok: false,
      error: /ECONNREFUSED|fetch failed|ENOTFOUND/i.test(msg) ? 'AI is not reachable' : `AI parse failed: ${msg.slice(0, 120)}`,
    };
  }
  const title = (parsed.title || page.title || url).slice(0, 200);
  const store =
    parsed.store ||
    (() => {
      try {
        return new URL(url).hostname.replace(/^www\./, '');
      } catch {
        return 'Source';
      }
    })();

  await connectDB();
  const targetUrl = normUrl(url);
  const targetTitle = normTitle(title);
  const all = await Item.find();
  let match = all.find((it) => (it.links ?? []).some((l) => l.url && normUrl(l.url) === targetUrl));
  if (!match && targetTitle.length >= 6) {
    match = all.find((it) => {
      const nt = normTitle(it.title);
      return nt.length >= 6 && (nt === targetTitle || nt.includes(targetTitle) || targetTitle.includes(nt));
    });
  }
  return {
    ok: true,
    title,
    price: parsed.price || 0,
    store,
    specs: parsed.specs || '',
    category: parsed.category || 'other',
    existing: match ? { id: String(match._id), title: match.title } : null,
  };
}

/** Save a previewed product (no AI re-parse). Mirrors importItemFromUrl's save path. */
export async function confirmImportItem(
  data: { url: string; title: string; price: number; store: string; specs: string; category: string },
  view: ItemView
): Promise<ImportItemResult> {
  try {
    await connectDB();
    const url = data.url;
    const title = (data.title || url).slice(0, 200);
    const store = data.store || 'Source';
    const price = data.price > 0 ? data.price : 0;
    const status = view === 'inventory' ? 'received' : 'researching';
    const category = (CATEGORIES as readonly string[]).includes(data.category) ? data.category : 'other';

    const targetUrl = normUrl(url);
    const targetTitle = normTitle(title);
    const all = await Item.find();
    let match = all.find((it) => (it.links ?? []).some((l) => l.url && normUrl(l.url) === targetUrl));
    if (!match && targetTitle.length >= 6) {
      match = all.find((it) => {
        const nt = normTitle(it.title);
        return nt.length >= 6 && (nt === targetTitle || nt.includes(targetTitle) || targetTitle.includes(nt));
      });
    }

    if (match) {
      if (!match.specs && data.specs) match.specs = data.specs;
      if (match.category === 'other' && category !== 'other') match.category = category as typeof match.category;
      const existingLink = (match.links ?? []).find((l) => l.url && normUrl(l.url) === targetUrl);
      if (existingLink) {
        if (price > 0) existingLink.price = price;
      } else {
        match.links.push({ label: store, url, price: price > 0 ? price : null });
      }
      match.markModified('links');
      if (price > 0) {
        match.priceHistory.push({ price, store, url, date: new Date() } as (typeof match.priceHistory)[number]);
        match.currentPrice = price;
      }
      if (match.photos.length === 0) await attachImagesFromUrl(match, url);
      await match.save();
      revalidatePath('/items');
      revalidatePath('/shopping');
      return { ok: true, id: String(match._id), title: match.title, price, store, updated: true };
    }

    const item = await Item.create({
      title,
      category,
      status,
      currentPrice: price,
      specs: data.specs,
      links: [{ label: store, url, price: price > 0 ? price : null }],
      priceHistory: price > 0 ? [{ price, store, url, date: new Date() }] : [],
    });
    const addedPhotos = await attachImagesFromUrl(item, url);
    if (addedPhotos > 0) await item.save();
    revalidatePath('/items');
    revalidatePath('/shopping');
    return { ok: true, id: String(item._id), title, price, store, updated: false };
  } catch (err) {
    return { ok: false, error: `DB error: ${(err as Error).message}` };
  }
}

export async function addPriceEntry(
  id: string,
  entry: { price: number; store: string; url?: string }
) {
  await connectDB();
  await Item.findByIdAndUpdate(id, {
    $push: { priceHistory: { ...entry, date: new Date() } },
    $set: { currentPrice: entry.price },
  });
  revalidatePath('/items');
}

/** Set (or clear) the target price from the price panel, without opening the form. */
export async function setItemTarget(id: string, target: number | null): Promise<{ ok: boolean }> {
  await connectDB();
  await Item.findByIdAndUpdate(id, { $set: { targetPrice: target && target > 0 ? target : null } });
  revalidatePath('/items');
  revalidatePath('/shopping');
  return { ok: true };
}

/** Log an observed price for an item (manual "I saw it at €X" — also used by the AI
 *  command bar). Appends to the history and updates the current price. */
export async function logItemPrice(
  id: string,
  price: number,
  store: string
): Promise<{ ok: boolean; error?: string }> {
  if (!(price > 0)) return { ok: false, error: 'Price must be greater than 0' };
  await connectDB();
  const r = await Item.findByIdAndUpdate(id, {
    $push: { priceHistory: { price, store: store.trim() || 'manual', date: new Date() } },
    $set: { currentPrice: price },
  });
  if (!r) return { ok: false, error: 'Item not found' };
  revalidatePath('/items');
  revalidatePath('/shopping');
  return { ok: true };
}
