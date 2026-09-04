'use server';
import { cur } from "@/lib/money";
import { connectDB } from '@/lib/db';
import { Item as ItemModel } from '@/models/Item';
import { Receipt as ReceiptModel } from '@/models/Receipt';
import { Statement as StatementModel } from '@/models/Statement';
import { Task as TaskModel } from '@/models/Task';
import { withRequestTenant } from '@/lib/tenancy/request';
import { currentModel } from '@/lib/tenancy/connection';
import { fetchPageText } from '@/lib/scrape';
import { parseProductFromPage } from '@/lib/ollama';
import { isFeatureEnabled } from '@/lib/aiFeatures.server';
import { searchWeb, searchImages } from '@/lib/search';
import { type ItemView } from '@/lib/itemStatus';
import { saveFile, deleteFile } from '@/lib/storage';
import { assertPublicUrl } from '@/lib/ssrf';
import { revalidatePath } from 'next/cache';
import { safeRevalidate } from '@/lib/revalidate';
import { Types } from 'mongoose';
import { z } from 'zod';
import { getAppSettings } from '@/lib/appSettings';
import {
  resolveItemPrices,
  sameCurrency,
  normalizeCurrency,
  effectiveCurrency,
  isForeignCurrency,
  type ItemPricesInput,
} from '@/lib/fx';
import type { SerializedItem, SerializedAttachment } from '@/types';
import { assertCanWrite } from '@/lib/auth';
import { parseCustomFields } from '@/lib/customFields';
import { maintenanceApplies, normalizeMaintenanceInterval } from '@/lib/maintenance';
import { isLentOut, lendingApplies, normalizeBorrower } from '@/lib/lending';
import { addExpense } from '@/app/expenses/actions';

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
  // P9 multi-currency: the ISO code the prices above are PRINTED in, and the rate to the
  // deployment's base currency. Absent (single-currency form) = nothing to convert.
  currency: z.string().default(''),
  fxRate: z.coerce.number().min(0).default(0),
  purchasedFrom: z.string().default(''),
  // P55 resale. Deliberately OUTSIDE the FX pipeline below: `fxRate` describes the
  // original receipt, while a resale is a separate, usually local transaction, so
  // `soldPrice` is taken as base currency exactly as typed. Blank = old behaviour.
  soldPrice: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? null : Number(v)),
    z.number().nullable().default(null)
  ),
  soldAt: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? null : new Date(String(v))),
    z.date().nullable().default(null)
  ),
  soldTo: z.string().default(''),
  // P72 parcel tracking. All three free strings, all optional: blank keeps `ordered`
  // behaving exactly as it did before. `trackingUrl` is the manual override.
  trackingNumber: z.string().default(''),
  carrier: z.string().default(''),
  trackingUrl: z.string().default(''),
  specs: z.string().default(''),
  notes: z.string().default(''),
  tags: z.string().default(''),
  serialNumber: z.string().default(''),
  location: z.string().default(''),
  // P41 maintenance schedule. Both blank keeps the item exactly as it was: an empty
  // interval normalises to null ("no schedule"), never to 0, so the absence round-trips.
  maintenanceIntervalDays: z.preprocess(
    (v) => normalizeMaintenanceInterval(v === '' || v === null || v === undefined ? null : v),
    z.number().nullable().default(null)
  ),
  lastMaintenanceAt: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? null : new Date(String(v))),
    z.date().nullable().default(null)
  ),
  // P47 lending. A blank borrower means "at home", which is every pre-P47 record; the two
  // dates are only meaningful next to a name, and resolveLending() below enforces that.
  lentTo: z.string().default(''),
  lentAt: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? null : new Date(String(v))),
    z.date().nullable().default(null)
  ),
  expectedReturnAt: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? null : new Date(String(v))),
    z.date().nullable().default(null)
  ),
  num: z.string().default(''),
  links: z.string().default('[]'), // JSON-encoded [{label,url}]
  // P70: JSON-encoded [{key,value}]. Absent (an older client, or the API routes) parses to
  // [], which is exactly the pre-P70 record — it never wipes anything a form did not send.
  customFields: z.string().default('[]'),
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

/** P9: resolve the form's PRINTED prices against the deployment's base currency.
 *  All the thinking lives in lib/fx.ts resolveItemPrices (pure + unit-tested); this only
 *  supplies the base code. */
async function resolveItemFx(parsed: ItemPricesInput) {
  return resolveItemPrices(parsed, (await getAppSettings()).currency);
}

/**
 * P47 — make the three lending fields consistent before they hit the database, so that no
 * combination of them can describe a state that does not exist.
 *
 *  - Only an owned item can be out on loan; on anything else the whole trio is cleared,
 *    which is what happens the moment a lent thing is marked sold or broken.
 *  - No borrower means the item is home, so BOTH dates are wiped. Keeping a stale
 *    `expectedReturnAt` on a returned item is exactly how a thing sitting on your shelf
 *    would keep showing up as overdue.
 *  - A borrower with no lend date gets today. Nobody wants to type a date to record
 *    something they are handing over right now, and "how long has it been gone" needs it.
 */
function resolveLending(parsed: {
  status: string;
  lentTo: string;
  lentAt: Date | null;
  expectedReturnAt: Date | null;
}): { lentTo: string; lentAt: Date | null; expectedReturnAt: Date | null } {
  const lentTo = lendingApplies(parsed.status) ? normalizeBorrower(parsed.lentTo) : '';
  if (!lentTo) return { lentTo: '', lentAt: null, expectedReturnAt: null };
  return { lentTo, lentAt: parsed.lentAt ?? new Date(), expectedReturnAt: parsed.expectedReturnAt };
}

export async function createItem(formData: FormData) {
  await assertCanWrite();
  return withRequestTenant(async () => {
  const raw = Object.fromEntries(formData);
  const parsed = ItemFormSchema.parse(raw);
  const { links, tags, customFields, ...rest } = parsed;
  const money = await resolveItemFx(parsed);
  await connectDB();
  const Item = await currentModel(ItemModel);
  const parsedLinks = parseLinks(links);
  // When store links carry prices, the headline price is DERIVED (cheapest link) —
  // the manual price field is only a fallback for link-less items. A link price is
  // whatever the shop/scraper quoted, so it is stored as-is and NOT FX-converted.
  const cl = lowestKnownPrice({ links: parsedLinks });
  await Item.create({
    ...rest,
    ...money,
    ...resolveLending(parsed),
    currentPrice: cl ?? money.currentPrice,
    tags: parseTags(tags),
    links: parsedLinks,
    customFields: parseCustomFields(customFields),
  });
  revalidatePath('/items');
  });
}

export async function updateItem(id: string, formData: FormData) {
  await assertCanWrite();
  return withRequestTenant(async () => {
  const raw = Object.fromEntries(formData);
  const parsed = ItemFormSchema.parse(raw);
  const { links, tags, customFields, ...rest } = parsed;
  const money = await resolveItemFx(parsed);
  await connectDB();
  const Item = await currentModel(ItemModel);
  const parsedLinks = parseLinks(links);
  const cl = lowestKnownPrice({ links: parsedLinks });
  await Item.findByIdAndUpdate(id, {
    ...rest,
    ...money,
    ...resolveLending(parsed),
    currentPrice: cl ?? money.currentPrice,
    tags: parseTags(tags),
    links: parsedLinks,
    customFields: parseCustomFields(customFields),
  });
  revalidatePath('/items');
  });
}

/**
 * P55 — book a recorded sale as income, ONE click, explicitly opt-in.
 *
 * Deliberately never automatic: plenty of people already type the sale in by hand (or it
 * lands via a bank statement), and an automatic booking would double-count it. The created
 * Expense id is written back to `soldIncomeId`, which is also the idempotency guard — a
 * second click on an already-logged sale is refused instead of creating a twin.
 *
 * `soldPrice` is base currency by construction (see the model note), so no currency/fxRate
 * is handed over and addExpense's own resolveFx passes the figure straight through.
 */
export async function logSaleAsIncome(
  id: string
): Promise<{ ok: boolean; expenseId?: string; error?: string }> {
  await assertCanWrite();
  return withRequestTenant(async () => {
    await connectDB();
    const Item = await currentModel(ItemModel);
    const item = await Item.findById(id).lean();
    if (!item) return { ok: false, error: 'Item not found' };
    if (item.soldIncomeId) return { ok: false, error: 'This sale is already logged as income' };
    const price = Number(item.soldPrice) || 0;
    if (price <= 0) return { ok: false, error: 'Set a sale price first' };

    const soldOn = item.soldAt ? new Date(item.soldAt) : new Date();
    const res = await addExpense({
      kind: 'income',
      vendor: (item.soldTo || '').trim() || item.title,
      category: 'other',
      amount: price,
      date: soldOn.toISOString(),
      notes: `Sold: ${item.title}`,
      verified: true,
    });
    if (!res.ok || !res.id) return { ok: false, error: res.error || 'Could not log the income' };

    await Item.updateOne({ _id: id }, { $set: { soldIncomeId: res.id } });
    revalidatePath('/items');
    revalidatePath('/income');
    return { ok: true, expenseId: res.id };
  });
}

/**
 * P72 — "it arrived": flip an ordered item to `received` from the tracking widget, so the
 * common case is one click instead of open-form / change-status / save.
 *
 * Guarded on the CURRENT status rather than blindly setting it: the button only exists on
 * an ordered item, but a stale tab could fire it against an item somebody already moved on,
 * and silently rewriting a `sold` or `installed` item back to `received` would lose state.
 * The tracking fields are deliberately KEPT — they are the record of how it got here.
 */
export async function markItemArrived(id: string): Promise<{ ok: boolean; error?: string }> {
  await assertCanWrite();
  return withRequestTenant(async () => {
    await connectDB();
    const Item = await currentModel(ItemModel);
    const res = await Item.updateOne(
      { _id: id, status: 'ordered' },
      { $set: { status: 'received' } }
    );
    if (!res.matchedCount) return { ok: false, error: 'This item is no longer marked as ordered' };
    revalidatePath('/items');
    revalidatePath('/shopping');
    return { ok: true };
  });
}

/**
 * P41 — "serviced it": restart the maintenance clock from today, one click, straight from
 * the detail panel. The MVP keeps no history on purpose (the backlog's builder default):
 * what people actually want to know is when the next one is due, and a log would need its
 * own UI to be worth storing.
 *
 * Guarded on the item still being owned AND still having a schedule, for the same reason
 * markItemArrived() guards on `ordered`: a stale tab must not stamp a date onto an item
 * somebody already sold, or onto one whose schedule was just removed.
 */
export async function markMaintenanceDone(id: string): Promise<{ ok: boolean; at?: string; error?: string }> {
  await assertCanWrite();
  return withRequestTenant(async () => {
    await connectDB();
    const Item = await currentModel(ItemModel);
    const doc = await Item.findById(id).select('status maintenanceIntervalDays').lean();
    if (!doc) return { ok: false, error: 'Item not found' };
    if (!maintenanceApplies(doc.status)) return { ok: false, error: 'Maintenance only applies to an item you own' };
    if (!normalizeMaintenanceInterval(doc.maintenanceIntervalDays)) {
      return { ok: false, error: 'This item has no maintenance interval yet' };
    }
    const at = new Date();
    await Item.updateOne({ _id: id }, { $set: { lastMaintenanceAt: at } });
    revalidatePath('/items');
    return { ok: true, at: at.toISOString() };
  });
}

/**
 * P47 — "it came back": clear the loan in one click from the detail panel.
 *
 * Clearing the borrower IS the return, because the borrower name is the only flag the
 * rest of the feature reads (see lib/lending.ts). The two dates go with it, so a thing
 * back on the shelf cannot keep looking overdue from a deadline nobody cares about now.
 *
 * No loan history is kept, matching the backlog's builder default and markMaintenanceDone
 * next door: what people want to know is where the drill is, and a log of every past
 * borrower would need its own UI before it was worth the storage.
 *
 * Guarded on the item still being out on loan, for the same reason markItemArrived guards
 * on `ordered`: a stale tab must not silently wipe fields somebody has just re-filled.
 */
export async function markItemReturned(id: string): Promise<{ ok: boolean; error?: string }> {
  await assertCanWrite();
  return withRequestTenant(async () => {
    await connectDB();
    const Item = await currentModel(ItemModel);
    const doc = await Item.findById(id).select('status lentTo').lean();
    if (!doc) return { ok: false, error: 'Item not found' };
    if (!isLentOut(doc.status, doc.lentTo)) return { ok: false, error: 'This item is not out on loan' };
    await Item.updateOne({ _id: id }, { $set: { lentTo: '', lentAt: null, expectedReturnAt: null } });
    revalidatePath('/items');
    return { ok: true };
  });
}

export async function deleteItem(id: string) {
  await assertCanWrite();
  return withRequestTenant(async () => {
  await connectDB();
  const Item = await currentModel(ItemModel);
  // Soft delete → Trash (Settings → Storage & data). Receipt/statement links stay
  // intact so a restore is lossless; purging from the Trash clears them for real.
  await Item.updateOne({ _id: id }, { $set: { deletedAt: new Date() } });

  revalidatePath('/items');
  revalidatePath('/shopping');
  revalidatePath('/receipts');
  revalidatePath('/statements');
  });
}

// ─── Product photos ──────────────────────────────────────────────────────

const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic']);

/** Upload one or more product photos (stored in the equipment bucket). */
export async function uploadItemPhotos(
  itemId: string,
  formData: FormData
): Promise<{ ok: boolean; added: number; photos: string[]; error?: string }> {
  await assertCanWrite();
  return withRequestTenant(async () => {
  const files = formData.getAll('files').filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { ok: false, added: 0, photos: [], error: 'No image found' };

  await connectDB();
  const Item = await currentModel(ItemModel);
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
  });
}

/** Remove a product photo (and delete the underlying file). */
export async function deleteItemPhoto(itemId: string, relativePath: string): Promise<{ ok: boolean; photos: string[] }> {
  await assertCanWrite();
  return withRequestTenant(async () => {
  await connectDB();
  const Item = await currentModel(ItemModel);
  const item = await Item.findById(itemId);
  if (!item) return { ok: false, photos: [] };
  const found = item.photos.includes(relativePath);
  if (!found) return { ok: false, photos: [...item.photos] };
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
  });
}

/** Make a photo the cover (move it to the front of the gallery). */
export async function setItemCover(itemId: string, relativePath: string): Promise<{ ok: boolean; photos: string[] }> {
  await assertCanWrite();
  return withRequestTenant(async () => {
  await connectDB();
  const Item = await currentModel(ItemModel);
  const item = await Item.findById(itemId);
  if (!item) return { ok: false, photos: [] };
  item.photos = [relativePath, ...item.photos.filter((p) => p !== relativePath)];
  await item.save();
  revalidatePath('/items');
  revalidatePath('/shopping');
  return { ok: true, photos: [...item.photos] };
  });
}

// ─── Documents / manual vault (P21) ──────────────────────────────────────
// An ongoing per-item repository (manuals, warranty certs, serial photos),
// distinct from `photos` (product gallery). Reuses the same equipment bucket
// and storage pipeline as photos — no new storage backend/bucket to wire up.

const DOC_EXTS = new Set(['pdf', 'jpg', 'jpeg', 'png', 'webp', 'heic', 'doc', 'docx', 'txt']);
const DOC_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain',
};

/** Upload one or more documents (manuals, warranty certs, serial-number photos). */
export async function uploadItemAttachments(
  itemId: string,
  formData: FormData
): Promise<{ ok: boolean; added: number; attachments: SerializedAttachment[]; error?: string }> {
  await assertCanWrite();
  return withRequestTenant(async () => {
  const files = formData.getAll('files').filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { ok: false, added: 0, attachments: [], error: 'No file selected' };

  await connectDB();
  const Item = await currentModel(ItemModel);
  const item = await Item.findById(itemId);
  if (!item) return { ok: false, added: 0, attachments: [], error: 'Item not found' };

  let added = 0;
  for (const file of files) {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (!DOC_EXTS.has(ext)) continue;
    const bytes = Buffer.from(await file.arrayBuffer());
    const { relativePath } = await saveFile('equipment', bytes, ext);
    item.attachments.push({
      path: relativePath,
      name: file.name.slice(0, 200),
      mimeType: DOC_MIME[ext] ?? 'application/octet-stream',
      size: file.size,
      uploadedAt: new Date(),
    } as (typeof item.attachments)[number]);
    added++;
  }
  if (added > 0) {
    item.markModified('attachments');
    await item.save();
  }

  revalidatePath('/items');
  revalidatePath('/shopping');
  return {
    ok: added > 0,
    added,
    attachments: JSON.parse(JSON.stringify(item.attachments)) as SerializedAttachment[],
    error: added === 0 ? 'Unsupported file type' : undefined,
  };
  });
}

/** Remove a document (and delete the underlying file). */
export async function deleteItemAttachment(
  itemId: string,
  path: string
): Promise<{ ok: boolean; attachments: SerializedAttachment[] }> {
  await assertCanWrite();
  return withRequestTenant(async () => {
  await connectDB();
  const Item = await currentModel(ItemModel);
  const item = await Item.findById(itemId);
  if (!item) return { ok: false, attachments: [] };
  const found = item.attachments.some((a) => a.path === path);
  if (!found) return { ok: false, attachments: JSON.parse(JSON.stringify(item.attachments)) as SerializedAttachment[] };
  item.attachments = item.attachments.filter((a) => a.path !== path) as typeof item.attachments;
  item.markModified('attachments');
  await item.save();
  try {
    await deleteFile(path);
  } catch {
    /* file already gone */
  }
  revalidatePath('/items');
  revalidatePath('/shopping');
  return { ok: true, attachments: JSON.parse(JSON.stringify(item.attachments)) as SerializedAttachment[] };
  });
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
    await assertPublicUrl(url);
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
      await assertPublicUrl(imgUrl);
      const ir = await fetch(imgUrl, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) });
      if (!ir.ok) continue;
      const ct = (ir.headers.get('content-type') || '').toLowerCase();
      if (!ct.startsWith('image/')) continue;
      if (Number(ir.headers.get('content-length') || 0) > 20_000_000) continue; // 20MB cap
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
    await assertPublicUrl(imgUrl);
    const ir = await fetch(imgUrl, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) });
    if (!ir.ok) return false;
    const ct = (ir.headers.get('content-type') || '').toLowerCase();
    if (!ct.startsWith('image/')) return false;
    if (Number(ir.headers.get('content-length') || 0) > 20_000_000) return false; // 20MB cap
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

/** Fetch product photos: image-search by title first (works even with no link),
 *  then product-page images from the given URLs. Mutates item.photos; caller saves.
 *  Returns how many were attached. */
async function fillPhotos(item: WithPhotos & { title: string }, targetUrls: string[]): Promise<number> {
  let added = 0;
  for (const im of await searchImages(item.title, 6)) {
    if (added >= 3) break;
    if (await attachOneImage(item, im.imgSrc)) added++;
  }
  if (added === 0) {
    for (const url of targetUrls) {
      const a = await attachImagesFromUrl(item, url, 4);
      if (a > 0) {
        added = a;
        break;
      }
    }
  }
  return added;
}

/**
 * Explicit "Fetch photos" action: image-search by title, falling back to images on
 * the product pages. Appends new photos. Works even when the item has no link, and
 * never touches specs/prices/tags — one of the three separate enrichment actions.
 */
export async function fetchItemPhotos(
  itemId: string
): Promise<{ ok: boolean; added: number; photos: string[]; error?: string }> {
  await assertCanWrite();
  return withRequestTenant(async () => {
  await connectDB();
  const Item = await currentModel(ItemModel);
  const item = await Item.findById(itemId);
  if (!item) return { ok: false, added: 0, photos: [], error: 'Item not found' };

  const targetUrls = (item.links ?? [])
    .map((l) => l.url)
    .filter((u): u is string => !!u && /^https?:\/\//i.test(u));
  const added = await fillPhotos(item, targetUrls);
  if (added > 0) await item.save();
  revalidatePath('/items');
  revalidatePath('/shopping');
  return { ok: added > 0, added, photos: [...item.photos], error: added === 0 ? 'Could not find/download images' : undefined };
  });
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
  /** P9: currencies whose prices were skipped (page quotes ≠ the item's currency). */
  priceSkippedCurrencies?: string[];
  item?: SerializedItem;
  error?: string;
}> {
  await assertCanWrite();
  return withRequestTenant(async () => {
  if (!(await isFeatureEnabled('itemsImport'))) return { ok: false, checked: 0, filled: [], lowest: null, error: 'Product AI-fill is turned off.' };
  await connectDB();
  const Item = await currentModel(ItemModel);
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
  // P9: codes of pages whose price was left out because they quote another currency than
  // this item's — reported back so a skipped price never looks like "no price found".
  const skippedCurrencies = new Set<string>();
  let lowest = Infinity;
  let fieldsDone = false;
  let okCount = 0;

  const base = (await getAppSettings()).currency;

  for (const t of targets) {
    let parsed;
    let pageCurrency = '';
    try {
      const page = await fetchPageText(t.url);
      parsed = (await parseProductFromPage(page)).parsed;
      pageCurrency = pageCurrencyOf(page, parsed);
    } catch {
      continue; // skip pages that fail (bot-protection, 404, AI hiccup)
    }
    // Skip pages whose product doesn't match this item (bare-domain homepage or a
    // bad search hit) — better to fill nothing than to write garbage.
    if (!productMatchesItem(item.title, parsed)) continue;
    okCount++;
    const store = parsed.store || hostOf(t.url);
    const alreadyLinked = (item.links ?? []).some((l) => normUrl(l.url) === normUrl(t.url));

    // P9: a shop quoting in another currency than this item's still gives us specs, tags and
    // a link — but not a price, because every price on an item shares its one FX rate.
    const priceUsable = parsed.price > 0 && sameCurrency(pageCurrency, item.currency, base);
    if (!priceUsable && parsed.price > 0) skippedCurrencies.add(effectiveCurrency(pageCurrency, base));

    if (priceUsable) {
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
    const added = await fillPhotos(item, targets.map((t) => t.url));
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
    priceSkippedCurrencies: [...skippedCurrencies],
    item: fresh ? (JSON.parse(JSON.stringify(fresh)) as SerializedItem) : undefined,
    error: found
      ? undefined
      : webDiscovered
        ? 'Web search found nothing usable for this title.'
        : 'Could not read any of the links (bot-protection or offline).',
  };
  });
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
  await assertCanWrite();
  return withRequestTenant(async () => {
  if (!(await isFeatureEnabled('itemsImport'))) return { ok: false, results: [] };
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
  });
}

/**
 * Fill/refresh ONLY the specs of an item from the web — reads its first link, or
 * (if it has none) the top web-search hit for its title, and overwrites specs.
 */
export async function aiFillSpecs(
  itemId: string
): Promise<{ ok: boolean; specs?: string; item?: SerializedItem; error?: string }> {
  await assertCanWrite();
  return withRequestTenant(async () => {
  if (!(await isFeatureEnabled('itemsImport'))) return { ok: false, error: 'AI specs is turned off.' };
  await connectDB();
  const Item = await currentModel(ItemModel);
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
  });
}

/**
 * AI fill INFO only — reads the item's links (or top web-search hits) and fills
 * EMPTY specs, an 'other' category, and merges in keyword tags. Additive: never
 * clobbers what you set, and never touches links/prices/currentPrice/photos. One of
 * the three separate enrichment actions (photos / info / prices).
 */
export async function aiFillInfo(
  itemId: string
): Promise<{ ok: boolean; filled: string[]; item?: SerializedItem; error?: string }> {
  await assertCanWrite();
  return withRequestTenant(async () => {
  if (!(await isFeatureEnabled('itemsImport'))) return { ok: false, filled: [], error: 'Product AI is turned off.' };
  await connectDB();
  const Item = await currentModel(ItemModel);
  const item = await Item.findById(itemId);
  if (!item) return { ok: false, filled: [], error: 'Item not found' };

  let targets: string[] = (item.links ?? [])
    .map((l) => l.url)
    .filter((u): u is string => !!u && /^https?:\/\//i.test(u));
  let webDiscovered = false;
  if (targets.length === 0) {
    const q = `${item.title} ${item.category !== 'other' ? item.category : ''}`.trim();
    const results = await searchWeb(q, 8);
    targets = results
      .filter((r) => /^https?:\/\//i.test(r.url) && !/youtube|facebook|reddit|pinterest|instagram|tiktok/i.test(r.url))
      .slice(0, 3)
      .map((r) => r.url);
    webDiscovered = true;
  }

  const filled = new Set<string>();
  let okCount = 0;
  for (const url of targets) {
    let parsed;
    try {
      const page = await fetchPageText(url);
      parsed = (await parseProductFromPage(page)).parsed;
    } catch {
      continue;
    }
    if (!productMatchesItem(item.title, parsed)) continue;
    okCount++;
    if (!item.specs && parsed.specs) {
      item.specs = parsed.specs;
      filled.add('specs');
    }
    if (item.category === 'other' && parsed.category && parsed.category !== 'other') {
      item.category = parsed.category;
      filled.add('category');
    }
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
    break; // info from the first matching page is enough
  }

  if (filled.size > 0) item.aiFilledAt = new Date();
  await item.save();
  revalidatePath('/items');
  revalidatePath('/shopping');
  const fresh = await Item.findById(itemId).lean();
  return {
    ok: okCount > 0,
    filled: [...filled],
    item: fresh ? (JSON.parse(JSON.stringify(fresh)) as SerializedItem) : undefined,
    error: okCount > 0 ? undefined : webDiscovered ? 'Web search found nothing usable for this title.' : 'Could not read any of the links.',
  };
  });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Convert an item into a standalone task. Copies the product's URLs (and prices)
 * into the task's notes — no link back to the item, no mutation of the item.
 */
export async function convertItemToTask(itemId: string): Promise<{ ok: boolean; taskId?: string; error?: string }> {
  await assertCanWrite();
  return withRequestTenant(async () => {
  await connectDB();
  const Item = await currentModel(ItemModel);
  const Task = await currentModel(TaskModel);
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
  });
}

export type ImportItemResult =
  | {
      ok: true;
      id: string;
      title: string;
      price: number;
      store: string;
      updated: boolean;
      /** P9: the page's ISO code when its price could NOT be recorded because the existing
       *  item keeps its money in another currency. The link is still added; the price is
       *  left out rather than silently counted as the item's currency. */
      priceSkippedCurrency?: string;
    }
  | { ok: false; error: string };

/**
 * Multi-currency (P9) for scraped product pages. The code a shop page quotes in, preferring
 * the page's own structured markup (schema.org priceCurrency / og:price:currency) over the
 * model's reading of it, and falling back to '' — which every caller reads as "base
 * currency", i.e. exactly the behaviour that existed before this. Never a guess: a page
 * that declares nothing and a model that saw nothing both mean "assume base".
 */
function pageCurrencyOf(page: { currency?: string }, parsed: { currency?: string }): string {
  return normalizeCurrency(page.currency) || normalizeCurrency(parsed.currency);
}

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

/** Map a URL host to a friendly store name — kept in sync with the scraper's
 *  storeFromUrl so prices added here group with scraper-added ones under one store. */
function storeFromUrl(url: string): string {
  let host = '';
  try {
    host = new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return 'unknown';
  }
  const map: Record<string, string> = {
    'skroutz.gr': 'Skroutz', 'skroutz.eu': 'Skroutz', 'xpatit.gr': 'xpatit.gr',
    'e-shop.gr': 'e-shop.gr', 'i-system.gr': 'i-system.gr', 'plaisio.gr': 'Πλαίσιο',
    'public.gr': 'Public', 'kotsovolos.gr': 'Κωτσόβολος', 'you.gr': 'you.gr',
    'amazon.de': 'Amazon.de', 'amazon.com': 'Amazon', 'aliexpress.com': 'AliExpress',
    'fs.com': 'FS.com', 'eu.store.ui.com': 'EU Store (Ubiquiti)', 'store.ui.com': 'Ubiquiti Store',
  };
  if (map[host]) return map[host];
  for (const key of Object.keys(map)) if (host.endsWith(key)) return map[key];
  return host;
}

/** Cheapest CURRENT store-link price — this drives `currentPrice` (the headline /
 *  list price). Price HISTORY is deliberately NOT included: history is for the
 *  chart and the "lowest ever" range marker, not the price you can buy at now. So a
 *  stale/old low (e.g. a seeded €475) never becomes the current price. Null when the
 *  item has no priced store links (then currentPrice is left as-is / manual). */
function lowestKnownPrice(item: { links?: { price?: number | null }[] }): number | null {
  let lo = Infinity;
  for (const l of item.links ?? []) if (l.price && l.price > 0) lo = Math.min(lo, l.price);
  return lo < Infinity ? lo : null;
}

/**
 * Import a product from a URL via the local AI. If the link (or title) already
 * matches an item in the library, update that item with any missing info and
 * record the price instead of creating a duplicate.
 */
export async function importItemFromUrl(url: string, view: ItemView): Promise<ImportItemResult> {
  await assertCanWrite();
  return withRequestTenant(async () => {
  if (!(await isFeatureEnabled('itemsImport'))) return { ok: false, error: 'Product import (AI) is turned off.' };
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
  const base = (await getAppSettings()).currency;
  const pageCurrency = pageCurrencyOf(page, parsed);

  try {
    await connectDB();
  const Item = await currentModel(ItemModel);

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
      // P9: a price quoted in another currency than the item's own must not be written onto
      // it — the item carries ONE rate for all its prices, so a USD quote stored next to EUR
      // figures would be summed as EUR everywhere. Keep the link, leave the price out, say so.
      const priceUsable = parsed.price > 0 && sameCurrency(pageCurrency, match.currency, base);
      const existingLink = (match.links ?? []).find((l) => l.url && normUrl(l.url) === targetUrl);
      if (existingLink) {
        if (priceUsable) existingLink.price = parsed.price;
      } else {
        match.links.push({ label: store, url, price: priceUsable ? parsed.price : null });
      }
      match.markModified('links');
      // Keep tracking the price: append to history + refresh the current price
      if (priceUsable) {
        match.priceHistory.push({ price: parsed.price, store, url, date: new Date() } as (typeof match.priceHistory)[number]);
        match.currentPrice = parsed.price;
      }
      // Grab product photos too, if it doesn't have any yet
      if (match.photos.length === 0) await attachImagesFromUrl(match, url);
      await match.save();
      revalidatePath('/items');
      revalidatePath('/shopping');
      return {
        ok: true,
        id: String(match._id),
        title: match.title,
        price: priceUsable ? parsed.price : 0,
        store,
        updated: true,
        ...(parsed.price > 0 && !priceUsable ? { priceSkippedCurrency: effectiveCurrency(pageCurrency, base) } : {}),
      };
    }

    // P9: a NEW item can adopt the page's currency, so a foreign price is stored as printed
    // and flagged for a rate (Reports → missing exchange rates) instead of counting as base.
    const fx = resolveItemPrices(
      { currentPrice: parsed.price, purchasedPrice: null, targetPrice: null, currency: pageCurrency },
      base
    );
    const item = await Item.create({
      title,
      category: parsed.category,
      status,
      currentPrice: fx.currentPrice,
      currency: fx.currency,
      origAmount: fx.origAmount,
      fxRate: fx.fxRate,
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
  });
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
      /** P9: ISO code the page quoted in, ONLY when it is foreign to the deployment's base
       *  currency; '' means "nothing to convert" (no code shown, or the base one). */
      currency: string;
      existing: { id: string; title: string } | null;
    }
  | { ok: false; error: string };

/** Fetch + AI-parse a product URL WITHOUT saving (the preview step). */
export async function previewItemFromUrl(url: string): Promise<ItemPreview> {
  return withRequestTenant(async () => {
  if (!(await isFeatureEnabled('itemsImport'))) return { ok: false, error: 'Product import (AI) is turned off.' };
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

  const base = (await getAppSettings()).currency;
  const pageCurrency = pageCurrencyOf(page, parsed);

  await connectDB();
  const Item = await currentModel(ItemModel);
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
    // Only report a FOREIGN code: a page quoting the base currency needs no conversion, so
    // '' keeps the approve step byte-for-byte what it was in a single-currency deployment.
    currency: isForeignCurrency(pageCurrency, base) ? pageCurrency : '',
    existing: match ? { id: String(match._id), title: match.title } : null,
  };
  });
}

/** Save a previewed product (no AI re-parse). Mirrors importItemFromUrl's save path. */
export async function confirmImportItem(
  data: { url: string; title: string; price: number; store: string; specs: string; category: string; currency?: string },
  view: ItemView
): Promise<ImportItemResult> {
  await assertCanWrite();
  return withRequestTenant(async () => {
  try {
    await connectDB();
  const Item = await currentModel(ItemModel);
    const url = data.url;
    const title = (data.title || url).slice(0, 200);
    const store = data.store || 'Source';
    const price = data.price > 0 ? data.price : 0;
    const status = view === 'inventory' ? 'received' : 'researching';
    const category = (CATEGORIES as readonly string[]).includes(data.category) ? data.category : 'other';
    // P9: the currency the preview read off the page (blank = none shown = base currency).
    const base = (await getAppSettings()).currency;
    const pageCurrency = normalizeCurrency(data.currency);

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
      // Same rule as importItemFromUrl: a quote in another currency than the item's own is
      // not written onto it (one item, one rate), only reported back.
      const priceUsable = price > 0 && sameCurrency(pageCurrency, match.currency, base);
      const existingLink = (match.links ?? []).find((l) => l.url && normUrl(l.url) === targetUrl);
      if (existingLink) {
        if (priceUsable) existingLink.price = price;
      } else {
        match.links.push({ label: store, url, price: priceUsable ? price : null });
      }
      match.markModified('links');
      if (priceUsable) {
        match.priceHistory.push({ price, store, url, date: new Date() } as (typeof match.priceHistory)[number]);
        match.currentPrice = price;
      }
      if (match.photos.length === 0) await attachImagesFromUrl(match, url);
      await match.save();
      revalidatePath('/items');
      revalidatePath('/shopping');
      return {
        ok: true,
        id: String(match._id),
        title: match.title,
        price: priceUsable ? price : 0,
        store,
        updated: true,
        ...(price > 0 && !priceUsable ? { priceSkippedCurrency: effectiveCurrency(pageCurrency, base) } : {}),
      };
    }

    const fx = resolveItemPrices(
      { currentPrice: price, purchasedPrice: null, targetPrice: null, currency: pageCurrency },
      base
    );
    const item = await Item.create({
      title,
      category,
      status,
      currentPrice: fx.currentPrice,
      currency: fx.currency,
      origAmount: fx.origAmount,
      fxRate: fx.fxRate,
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
  });
}

export async function addPriceEntry(
  id: string,
  entry: { price: number; store: string; url?: string }
) {
  await assertCanWrite();
  return withRequestTenant(async () => {
  await connectDB();
  const Item = await currentModel(ItemModel);
  await Item.findByIdAndUpdate(id, {
    $push: { priceHistory: { ...entry, date: new Date() } },
    $set: { currentPrice: entry.price },
  });
  revalidatePath('/items');
  });
}

/** Set (or clear) the target price from the price panel, without opening the form. */
export async function setItemTarget(id: string, target: number | null): Promise<{ ok: boolean }> {
  await assertCanWrite();
  return withRequestTenant(async () => {
  await connectDB();
  const Item = await currentModel(ItemModel);
  await Item.findByIdAndUpdate(id, { $set: { targetPrice: target && target > 0 ? target : null } });
  revalidatePath('/items');
  revalidatePath('/shopping');
  return { ok: true };
  });
}

/** Log an observed price for an item (manual "I saw it at €X" — also used by the AI
 *  command bar). Appends to the history and updates the current price. */
export async function logItemPrice(
  id: string,
  price: number,
  store: string
): Promise<{ ok: boolean; error?: string }> {
  await assertCanWrite();
  return withRequestTenant(async () => {
  if (!(price > 0)) return { ok: false, error: 'Price must be greater than 0' };
  await connectDB();
  const Item = await currentModel(ItemModel);
  const r = await Item.findByIdAndUpdate(id, {
    $push: { priceHistory: { price, store: store.trim() || 'manual', date: new Date() } },
    $set: { currentPrice: price },
  });
  if (!r) return { ok: false, error: 'Item not found' };
  revalidatePath('/items');
  revalidatePath('/shopping');
  return { ok: true };
  });
}

// ─── Merge duplicate products ────────────────────────────────────────────────

export type DupItem = {
  _id: string;
  title: string;
  num: string;
  status: string;
  currentPrice: number;
  links: number;
  photos: number;
  receipts: number;
  thumbPath: string;
};
export type ItemDupGroup = { key: string; items: DupItem[] };

const STATUS_RANK: Record<string, number> = {
  installed: 6, received: 5, ordered: 4, decided: 3, researching: 2, deferred: 1, sold: 0, broken: 0,
};

/**
 * Find clusters of likely-duplicate items by normalized title. Sorts the most
 * complete one first in each group (most receipts, photos, status, links) so the UI
 * can default to keeping it. (Items arriving from receipts vs URL-import with
 * different titles won't cluster here — the select-mode "Merge" covers those.)
 */
export async function findDuplicateItems(): Promise<ItemDupGroup[]> {
  return withRequestTenant(async () => {
  await connectDB();
  const Item = await currentModel(ItemModel);
  const items = await Item.find({ deletedAt: null })
    .select('title num status currentPrice links photos receiptIds')
    .lean();

  const groups = new Map<string, DupItem[]>();
  for (const it of items as Array<Record<string, unknown>>) {
    const key = normTitle(String(it.title ?? ''));
    if (key.length < 3) continue;
    const photos = Array.isArray(it.photos) ? (it.photos as string[]) : [];
    const entry: DupItem = {
      _id: String(it._id),
      title: String(it.title ?? 'Untitled'),
      num: String(it.num ?? ''),
      status: String(it.status ?? 'researching'),
      currentPrice: Number(it.currentPrice) || 0,
      links: Array.isArray(it.links) ? it.links.length : 0,
      photos: photos.length,
      receipts: Array.isArray(it.receiptIds) ? it.receiptIds.length : 0,
      thumbPath: photos[0] ?? '',
    };
    const list = groups.get(key);
    if (list) list.push(entry);
    else groups.set(key, [entry]);
  }

  const out: ItemDupGroup[] = [];
  for (const [key, list] of groups) {
    if (list.length < 2) continue;
    list.sort(
      (a, b) =>
        b.receipts - a.receipts ||
        b.photos - a.photos ||
        (STATUS_RANK[b.status] ?? 0) - (STATUS_RANK[a.status] ?? 0) ||
        b.links - a.links
    );
    out.push({ key, items: list });
  }
  out.sort((a, b) => b.items.length - a.items.length);
  return out;
  });
}

/**
 * Merge duplicate items into one. Backfills empty fields on the survivor, unions
 * its arrays (tags/links/priceHistory/photos/receiptIds), re-points every reference
 * (Receipt.itemIds, Receipt.lineItems[].matchedItemId, Statement.transactions[].
 * matchedItemIds) at the survivor, then soft-deletes the duplicates to Trash. Their
 * photo paths are released to the survivor (so a future purge won't delete shared files).
 */
export async function mergeItems(
  keepId: string,
  dropIds: string[]
): Promise<{ ok: boolean; merged: number; error?: string }> {
  await assertCanWrite();
  return withRequestTenant(async () => {
  await connectDB();
  const Item = await currentModel(ItemModel);
  const Receipt = await currentModel(ReceiptModel);
  const Statement = await currentModel(StatementModel);
  const keep = await Item.findById(keepId);
  if (!keep) return { ok: false, merged: 0, error: 'Item to keep not found' };
  const targets = dropIds.filter((id) => id && id !== keepId);
  const drops = await Item.find({ _id: { $in: targets } });
  if (drops.length === 0) return { ok: false, merged: 0, error: 'No items to merge' };

  const keepOid = new Types.ObjectId(String(keep._id));

  for (const d of drops) {
    // Backfill empty scalars — never clobber what the survivor already has.
    if (!keep.num && d.num) keep.num = d.num;
    if (keep.category === 'other' && d.category && d.category !== 'other') keep.category = d.category;
    if (!keep.specs && d.specs) keep.specs = d.specs;
    if (!keep.notes && d.notes) keep.notes = d.notes;
    if (!keep.purchasedFrom && d.purchasedFrom) keep.purchasedFrom = d.purchasedFrom;
    if (keep.purchasedPrice == null && d.purchasedPrice != null) keep.purchasedPrice = d.purchasedPrice;
    if (keep.purchasedAt == null && d.purchasedAt != null) keep.purchasedAt = d.purchasedAt;
    if (keep.targetPrice == null && d.targetPrice != null) keep.targetPrice = d.targetPrice;
    if (keep.warrantyUntil == null && d.warrantyUntil != null) keep.warrantyUntil = d.warrantyUntil;
    if (!keep.serialNumber && d.serialNumber) keep.serialNumber = d.serialNumber;
    if (!keep.location && d.location) keep.location = d.location;

    // Union tags (dedup case-insensitively, cap 8)
    const seenTags = new Set((keep.tags ?? []).map((t) => t.toLowerCase()));
    for (const raw of d.tags ?? []) {
      const low = String(raw).toLowerCase();
      if (low && !seenTags.has(low) && keep.tags.length < 8) {
        keep.tags.push(raw);
        seenTags.add(low);
      }
    }
    // Union links (dedup by normUrl; backfill a null price from a dup)
    for (const l of d.links ?? []) {
      if (!l.url) continue;
      const existing = keep.links.find((k) => k.url && normUrl(k.url) === normUrl(l.url!));
      if (existing) {
        if (existing.price == null && l.price != null) existing.price = l.price;
      } else {
        keep.links.push({ label: l.label, url: l.url, price: l.price ?? null });
      }
    }
    // Concat price history (plain objects — don't reparent another doc's subdocs)
    for (const h of d.priceHistory ?? []) {
      keep.priceHistory.push({
        price: h.price,
        store: h.store,
        url: h.url ?? '',
        currency: h.currency,
        date: h.date,
        inStock: h.inStock,
      } as (typeof keep.priceHistory)[number]);
    }
    for (const p of d.photos ?? []) if (!keep.photos.includes(p)) keep.photos.push(p);
    // Union attachments (documents follow the same file-ownership transfer as photos)
    for (const a of d.attachments ?? []) {
      if (!keep.attachments.some((k) => k.path === a.path)) {
        keep.attachments.push({
          path: a.path,
          name: a.name,
          mimeType: a.mimeType,
          size: a.size,
          uploadedAt: a.uploadedAt,
        } as (typeof keep.attachments)[number]);
      }
    }
    // Union receiptIds
    for (const rid of d.receiptIds ?? []) {
      if (!keep.receiptIds.some((x) => String(x) === String(rid))) keep.receiptIds.push(rid);
    }
  }

  const lowest = lowestKnownPrice(keep);
  if (lowest != null) keep.currentPrice = lowest;

  keep.markModified('tags');
  keep.markModified('links');
  keep.markModified('priceHistory');
  keep.markModified('photos');
  keep.markModified('attachments');
  keep.markModified('receiptIds');
  await keep.save();

  for (const d of drops) {
    const dOid = new Types.ObjectId(String(d._id));
    // Re-point references → survivor.
    await Receipt.updateMany({ itemIds: dOid }, { $addToSet: { itemIds: keepOid } });
    await Receipt.updateMany({ itemIds: dOid }, { $pull: { itemIds: dOid } });
    await Receipt.updateMany(
      { 'lineItems.matchedItemId': dOid },
      { $set: { 'lineItems.$[el].matchedItemId': keepOid } },
      { arrayFilters: [{ 'el.matchedItemId': dOid }] }
    );
    await Statement.updateMany(
      { 'transactions.matchedItemIds': dOid },
      { $addToSet: { 'transactions.$[t].matchedItemIds': keepOid } },
      { arrayFilters: [{ 't.matchedItemIds': dOid }] }
    );
    await Statement.updateMany(
      { 'transactions.matchedItemIds': dOid },
      { $pull: { 'transactions.$[t].matchedItemIds': dOid } },
      { arrayFilters: [{ 't.matchedItemIds': dOid }] }
    );
    // Soft-delete the duplicate + release its photo/attachment paths (files now live
    // on `keep`, so a later Trash purge of this shell won't delete the shared files).
    await Item.updateOne({ _id: d._id }, { $set: { deletedAt: new Date(), photos: [], attachments: [] } });
  }

  revalidatePath('/items');
  revalidatePath('/shopping');
  revalidatePath('/receipts');
  revalidatePath('/statements');
  return { ok: true, merged: drops.length };
  });
}

export type BulkItemPatch = { category?: string; status?: string; addTags?: string[] };

/**
 * Bulk field-edit (P78): apply a category/status change and/or additive tags to every selected
 * item in ONE `updateMany`, instead of opening the detail modal N times for the same edit (e.g.
 * a batch of receipts that became items with the wrong category, or a delivery of 8 items that
 * all just arrived → mark "received"). Deliberately narrow — only fields that are safe to set
 * identically across many different items at once. Anything individually-required (title,
 * price) stays a 1-to-1 edit, so a bulk click can never mass-corrupt those. `status` is
 * validated against the same STATUSES enum the form uses; an unrecognised value is silently
 * dropped rather than rejecting the whole call, since category/tags may still be worth applying.
 */
export async function bulkUpdateItems(
  ids: string[],
  patch: BulkItemPatch
): Promise<{ ok: boolean; updated: number; error?: string }> {
  await assertCanWrite();
  return withRequestTenant(async () => {
    const targets = [...new Set(ids)].filter(Boolean);
    if (targets.length === 0) return { ok: false, updated: 0, error: 'No items selected' };

    const category = patch.category?.trim();
    const status = patch.status && (STATUSES as readonly string[]).includes(patch.status) ? patch.status : undefined;
    const addTags = [...new Set((patch.addTags ?? []).map((t) => t.trim()).filter(Boolean))];

    const set: Record<string, unknown> = {};
    if (category) set.category = category;
    if (status) set.status = status;
    const update: Record<string, unknown> = {};
    if (Object.keys(set).length) update.$set = set;
    if (addTags.length) update.$addToSet = { tags: { $each: addTags } };
    if (Object.keys(update).length === 0) return { ok: false, updated: 0, error: 'Nothing to update' };

    await connectDB();
    const Item = await currentModel(ItemModel);
    const res = await Item.updateMany({ _id: { $in: targets } }, update);
    revalidatePath('/items');
    revalidatePath('/shopping');
    return { ok: true, updated: res.modifiedCount ?? targets.length };
  });
}

// ─── Interactive online price search (pick a shop to track) ──────────────────

export type PriceCandidate = {
  store: string;
  url: string;
  price: number;
  currency: string;
  inStock: boolean;
  title: string;
  alreadyLinked: boolean;
  error?: string;
};

/**
 * Search the web for shops selling this item and read a price from each — for the
 * interactive "pick which shops to track" picker. Reads up to 5 shops (each = a page
 * fetch + 1 AI call), relevance-guarded. NO DB writes. Per-shop failures (e.g.
 * Cloudflare) come back as `error` rows so the UI can show them instead of dropping.
 */
export async function searchItemPriceCandidates(
  itemId: string,
  queryOverride?: string
): Promise<{ ok: boolean; candidates: PriceCandidate[]; error?: string }> {
  return withRequestTenant(async () => {
  if (!(await isFeatureEnabled('itemsImport'))) return { ok: false, candidates: [], error: 'Product AI is turned off.' };
  await connectDB();
  const Item = await currentModel(ItemModel);
  const item = await Item.findById(itemId).lean();
  if (!item) return { ok: false, candidates: [], error: 'Item not found' };

  const q = (queryOverride || item.title || '').trim();
  if (!q) return { ok: false, candidates: [], error: 'Nothing to search for' };

  const results = await searchWeb(q, 8);
  const urls = results
    .map((r) => r.url)
    .filter((u) => /^https?:\/\//i.test(u) && !/youtube|facebook|reddit|pinterest|instagram|tiktok|wikipedia/i.test(u))
    .filter((u, i, arr) => arr.findIndex((x) => normUrl(x) === normUrl(u)) === i) // dedup
    .slice(0, 5); // cap AI cost

  const linked = new Set(
    (item.links ?? []).map((l: { url?: string }) => (l.url ? normUrl(l.url) : '')).filter(Boolean)
  );

  const candidates: PriceCandidate[] = [];
  for (const url of urls) {
    try {
      const page = await fetchPageText(url);
      const parsed = (await parseProductFromPage(page)).parsed;
      if (!productMatchesItem(item.title, parsed)) continue; // unrelated search hit
      candidates.push({
        store: parsed.store || storeFromUrl(url),
        url,
        price: parsed.price > 0 ? parsed.price : 0,
        currency: parsed.currency || 'EUR',
        inStock: true,
        title: parsed.title || page.title || '',
        alreadyLinked: linked.has(normUrl(url)),
      });
    } catch (err) {
      const msg = (err as Error).message || String(err);
      candidates.push({
        store: storeFromUrl(url),
        url,
        price: 0,
        currency: 'EUR',
        inStock: false,
        title: '',
        alreadyLinked: linked.has(normUrl(url)),
        error: /cloudflare|solver|challenge|just a moment/i.test(msg)
          ? 'Behind Cloudflare — start the price-scraper profile'
          : msg.slice(0, 80),
      });
    }
  }
  return { ok: true, candidates };
  });
}

/**
 * Add the user-picked shops as tracked store links (store + URL + price) plus a
 * price-history point each. They then show in "Where to buy" and are re-scraped
 * every 6h by the scraper (it tracks every item with a link).
 */
export async function addPriceLinks(
  itemId: string,
  picks: { store: string; url: string; price: number; currency?: string }[]
): Promise<{ ok: boolean; item?: SerializedItem; added: number; error?: string }> {
  await assertCanWrite();
  return withRequestTenant(async () => {
  await connectDB();
  const Item = await currentModel(ItemModel);
  const item = await Item.findById(itemId);
  if (!item) return { ok: false, added: 0, error: 'Item not found' };

  let added = 0;
  for (const pick of picks) {
    if (!pick.url || !/^https?:\/\//i.test(pick.url)) continue;
    const price = pick.price > 0 ? pick.price : null;
    const store = pick.store || storeFromUrl(pick.url);
    const existing = item.links.find((l) => l.url && normUrl(l.url) === normUrl(pick.url));
    if (existing) {
      if (price != null) existing.price = price;
    } else {
      item.links.push({ label: store, url: pick.url, price });
    }
    if (price != null) {
      item.priceHistory.push({ price, store, url: pick.url, date: new Date() } as (typeof item.priceHistory)[number]);
    }
    added++;
  }
  if (added === 0) return { ok: false, added: 0, error: 'Nothing to add' };

  const lowest = lowestKnownPrice(item);
  if (lowest != null) item.currentPrice = lowest;
  item.markModified('links');
  item.markModified('priceHistory');
  await item.save();
  revalidatePath('/items');
  revalidatePath('/shopping');
  const fresh = await Item.findById(itemId).lean();
  return { ok: true, added, item: fresh ? (JSON.parse(JSON.stringify(fresh)) as SerializedItem) : undefined };
  });
}

// ─── Refresh the prices of an item's ALREADY-tracked store links ─────────────

export type PriceRefresh = {
  store: string;
  url: string;
  oldPrice: number | null;
  newPrice: number | null;
  changed: 'down' | 'up' | 'same' | 'error';
  error?: string;
};

/**
 * Re-check the item's EXISTING store links right now (on-demand, vs the 6h scraper):
 * fetch each tracked URL, read its current price, update the link + price history, and
 * return a per-store diff so the user sees what moved. Recomputes currentPrice.
 */
export async function refreshItemPrices(
  itemId: string
): Promise<{ ok: boolean; results: PriceRefresh[]; error?: string }> {
  await assertCanWrite();
  return withRequestTenant(async () => {
  if (!(await isFeatureEnabled('itemsImport'))) return { ok: false, results: [], error: 'Product AI is turned off.' };
  await connectDB();
  const Item = await currentModel(ItemModel);
  const item = await Item.findById(itemId);
  if (!item) return { ok: false, results: [], error: 'Item not found' };

  const links = (item.links ?? []).filter((l) => l.url && /^https?:\/\//i.test(l.url));
  if (links.length === 0) return { ok: false, results: [], error: 'No tracked store links to refresh.' };

  const results: PriceRefresh[] = [];
  let anyChange = false;
  for (const link of links) {
    const store = link.label || storeFromUrl(link.url!);
    const oldPrice = link.price ?? null;
    try {
      const page = await fetchPageText(link.url!);
      const parsed = (await parseProductFromPage(page)).parsed;
      if (!productMatchesItem(item.title, parsed)) {
        results.push({ store, url: link.url!, oldPrice, newPrice: oldPrice, changed: 'error', error: 'Page no longer matches this product' });
        continue;
      }
      const newPrice = parsed.price > 0 ? parsed.price : null;
      if (newPrice == null) {
        results.push({ store, url: link.url!, oldPrice, newPrice: oldPrice, changed: 'error', error: 'No price found on the page' });
        continue;
      }
      let changed: PriceRefresh['changed'];
      if (oldPrice == null) changed = 'same';
      else if (newPrice < oldPrice) changed = 'down';
      else if (newPrice > oldPrice) changed = 'up';
      else changed = 'same';
      link.price = newPrice;
      if (oldPrice == null || newPrice !== oldPrice) {
        item.priceHistory.push({ price: newPrice, store, url: link.url!, date: new Date() } as (typeof item.priceHistory)[number]);
        anyChange = true;
      }
      results.push({ store, url: link.url!, oldPrice, newPrice, changed });
    } catch (err) {
      const msg = (err as Error).message || String(err);
      results.push({
        store,
        url: link.url!,
        oldPrice,
        newPrice: oldPrice,
        changed: 'error',
        error: /cloudflare|solver|challenge|just a moment/i.test(msg)
          ? 'Behind Cloudflare — start the price-scraper profile'
          : msg.slice(0, 80),
      });
    }
  }

  const lowest = lowestKnownPrice(item);
  if (lowest != null) item.currentPrice = lowest;
  item.markModified('links');
  if (anyChange) item.markModified('priceHistory');
  await item.save();
  revalidatePath('/items');
  revalidatePath('/shopping');
  return { ok: true, results };
  });
}

/**
 * One-time maintenance: recompute every item's currentPrice from its links + price
 * history (lowest known). Fixes stale/seeded headline prices (e.g. a €475 with no
 * store behind it) so the big number always reflects real, tracked prices.
 */
export async function recomputeAllItemPrices(): Promise<{ ok: boolean; updated: number }> {
  await assertCanWrite();
  return withRequestTenant(async () => {
  await connectDB();
  const Item = await currentModel(ItemModel);
  const items = await Item.find();
  let updated = 0;
  for (const it of items) {
    const lo = lowestKnownPrice(it);
    if (lo != null && lo !== it.currentPrice) {
      it.currentPrice = lo;
      await it.save();
      updated++;
    }
  }
  revalidatePath('/items');
  revalidatePath('/shopping');
  return { ok: true, updated };
  });
}
