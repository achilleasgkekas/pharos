'use server';
import { connectDB } from '@/lib/db';
import { Receipt as ReceiptModel } from '@/models/Receipt';
import { Item as ItemModel } from '@/models/Item';
import { withRequestTenant } from '@/lib/tenancy/request';
import { currentModel } from '@/lib/tenancy/connection';
import { saveFile, deleteFile, readFile } from '@/lib/storage';
import { parseReceipt, parseReceiptText } from '@/lib/ollama';
import { isFeatureEnabled } from '@/lib/aiFeatures.server';
import { extractPdfText, looksLikeScannedPdf } from '@/lib/pdf';
import { ocrImage, looksLikeUsableOcr } from '@/lib/ocr';
import { pdfFirstPageJpeg } from '@/lib/pdfThumb';
import { safeDate } from '@/lib/dates';
import { safeRevalidate } from '@/lib/revalidate';
import { getAppSettings } from '@/lib/appSettings';
import { mirrorFileToRemote } from '@/lib/mirror';
import { htmlReceiptToText } from '@/lib/htmlReceipt';
import { revalidatePath } from 'next/cache';
import { Types } from 'mongoose';
import { z } from 'zod';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { SerializedReceipt } from '@/types';

const LineItemSchema = z.object({
  name: z.string(),
  refinedName: z.string().default(''),
  qty: z.coerce.number().default(1),
  price: z.coerce.number().default(0),
  vatRate: z.coerce.number().default(24),
});

const UpdateReceiptSchema = z.object({
  store: z.string().min(1),
  date: z.string(),
  total: z.coerce.number(),
  subtotal: z.coerce.number().default(0),
  vatAmount: z.coerce.number().default(0),
  warrantyMonths: z.coerce.number().default(24),
  currency: z.string().default('EUR'),
  paymentMethod: z.string().default(''),
  lineItems: z.array(LineItemSchema).default([]),
  notes: z.string().default(''),
  verified: z.boolean().default(false),
});

export type UploadResult =
  | { ok: true; id: string; aiUsed: boolean; aiError?: string }
  | { ok: false; error: string };

type RawLineItem = { name?: string; refinedName?: string; qty?: number; price?: number; vatRate?: number };

/** The vision model sometimes returns line items with a blank name (which fails the
 *  `required` validator) or fully-empty rows. Give each a usable name (falling back
 *  to the refined name) and drop rows with no name AND no price, so one stray line
 *  never blocks a whole batch import. */
function cleanLineItems(items: RawLineItem[] | undefined, defaultVat = 24) {
  return (items ?? [])
    .filter((li) => (li.name?.trim() || li.refinedName?.trim() || (li.price ?? 0) > 0))
    .map((li) => ({
      name: li.name?.trim() || li.refinedName?.trim() || 'Item',
      refinedName: li.refinedName ?? '',
      qty: li.qty ?? 1,
      price: li.price ?? 0,
      vatRate: li.vatRate ?? defaultVat,
    }));
}

type ParseMode = 'auto' | 'ocr' | 'no-ocr';
type ParseOut = { parsed: Awaited<ReturnType<typeof parseReceipt>>['parsed'] | null; raw: string; model: string; aiError?: string };

/**
 * Shared receipt parser used by upload + re-scan.
 * - Text PDF        → embedded text → TEXT model (most accurate).
 * - Scanned PDF     → rasterize page 1 (pdftoppm) → OCR (Tesseract) → TEXT model.
 * - Image           → OCR-first → TEXT model, vision fallback.
 * mode: 'auto' (smart default) · 'ocr' (force OCR) · 'no-ocr' (embedded text / vision).
 */
async function runReceiptParse(bytes: Buffer, ext: string, isPdf: boolean, mode: ParseMode): Promise<ParseOut> {
  try {
    // Email order-confirmation body (.html) → strip to text → TEXT model.
    if (ext === 'html' || ext === 'htm') {
      const r = await parseReceiptText(htmlReceiptToText(bytes.toString('utf8')));
      return { parsed: r.parsed, raw: r.raw, model: `email-body+${r.model}` };
    }
    if (isPdf) {
      const text = await extractPdfText(bytes);
      const scanned = looksLikeScannedPdf(text);
      // Text PDF (and not forced-OCR): the embedded text is the cleanest source.
      if (!scanned && mode !== 'ocr') {
        const r = await parseReceiptText(text);
        return { parsed: r.parsed, raw: r.raw, model: r.model };
      }
      // Scanned/image PDF, or forced OCR → rasterize page 1 at high res.
      const img = await pdfFirstPageJpeg(bytes, 1654);
      if (!img) return { parsed: null, raw: '', model: '', aiError: 'Could not rasterize the PDF' };
      if (mode === 'no-ocr') {
        const r = await parseReceipt(img.toString('base64')); // vision on the page image
        return { parsed: r.parsed, raw: r.raw, model: `vision-pdf+${r.model}` };
      }
      const ocrText = await ocrImage(img, 'jpg');
      if (looksLikeUsableOcr(ocrText)) {
        const r = await parseReceiptText(ocrText);
        return { parsed: r.parsed, raw: r.raw, model: `ocr-pdf+${r.model}` };
      }
      const r = await parseReceipt(img.toString('base64')); // OCR empty → vision fallback
      return { parsed: r.parsed, raw: r.raw, model: `vision-pdf+${r.model}` };
    }
    // Image receipt
    if (mode === 'no-ocr') {
      const r = await parseReceipt(bytes.toString('base64'));
      return { parsed: r.parsed, raw: r.raw, model: r.model };
    }
    const ocrText = await ocrImage(bytes, ext);
    if (looksLikeUsableOcr(ocrText)) {
      const r = await parseReceiptText(ocrText);
      return { parsed: r.parsed, raw: r.raw, model: `ocr+${r.model}` };
    }
    const r = await parseReceipt(bytes.toString('base64')); // OCR empty → vision
    return { parsed: r.parsed, raw: r.raw, model: r.model };
  } catch (err) {
    const msg = (err as Error).message || String(err);
    const aiError = /ECONNREFUSED|fetch failed|ENOTFOUND/i.test(msg)
      ? 'Ollama is not reachable (check it is running)'
      : /not found|no such model|pull/i.test(msg)
        ? 'The AI model is not installed'
        : /pdf|password|encrypted/i.test(msg)
          ? `Failed to read PDF: ${msg.slice(0, 100)}`
          : `AI parse failed: ${msg.slice(0, 120)}`;
    return { parsed: null, raw: '', model: '', aiError };
  }
}

/**
 * Upload a receipt image, run it through the local Ollama vision model,
 * and store a draft Receipt (verified: false) for the user to confirm.
 * Degrades gracefully if Ollama is offline — creates an empty draft.
 */
// Matches next.config serverActions.bodySizeLimit; also bounds in-memory buffering + OCR.
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

export async function uploadReceipt(formData: FormData): Promise<UploadResult> {
  return withRequestTenant(async () => {
  const file = formData.get('file');
  if (!file || !(file instanceof File) || file.size === 0) {
    return { ok: false, error: 'No file found' };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return { ok: false, error: 'File too large (max 15MB)' };
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const isPdf = file.type === 'application/pdf' || ext === 'pdf';

  let relativePath: string;
  try {
    const saved = await saveFile('receipts', bytes, isPdf ? 'pdf' : ext);
    relativePath = saved.relativePath;
  } catch (err) {
    return { ok: false, error: `Failed to save file: ${(err as Error).message}` };
  }

  // For PDFs, pre-render page 1 to a small JPEG so the list shows a real preview.
  let thumbPath = '';
  if (isPdf) {
    const jpeg = await pdfFirstPageJpeg(bytes, 480);
    if (jpeg) {
      try {
        thumbPath = (await saveFile('receipts', jpeg, 'jpg')).relativePath;
      } catch {
        /* thumbnail is best-effort */
      }
    }
  }

  // Parse: text PDF → embedded text; scanned PDF → rasterize + OCR; image → OCR-first.
  // When receipt-AI is off, skip parsing entirely and save a draft to fill in manually.
  const { parsed, raw, model, aiError } = (await isFeatureEnabled('receipts'))
    ? await runReceiptParse(bytes, ext, isPdf, 'auto')
    : { parsed: null, raw: '', model: 'ai-off', aiError: 'AI is off — saved as a draft to fill in manually.' };

  try {
    await connectDB();
    const Receipt = await currentModel(ReceiptModel);
    const receipt = await Receipt.create({
      store: parsed?.store || 'Unknown store',
      date: safeDate(parsed?.date),
      total: parsed?.total ?? 0,
      subtotal: parsed?.subtotal ?? 0,
      vatAmount: parsed?.vatAmount ?? 0,
      warrantyMonths: parsed?.warrantyMonths || (await getAppSettings()).defaultWarrantyMonths,
      currency: parsed?.currency || 'EUR',
      paymentMethod: parsed?.paymentMethod || '',
      lineItems: cleanLineItems(parsed?.lineItems, (await getAppSettings()).defaultVatRate),
      filePath: relativePath,
      fileType: file.type || (isPdf ? 'application/pdf' : `image/${ext}`),
      thumbPath,
      fileSize: file.size,
      rawAiResponse: raw,
      aiModel: model,
      aiParsedAt: parsed ? new Date() : null,
      verified: false,
    });

    revalidatePath('/receipts');
    return { ok: true, id: String(receipt._id), aiUsed: parsed !== null, aiError };
  } catch (err) {
    return { ok: false, error: `DB error: ${(err as Error).message}` };
  }
  });
}

export async function updateReceipt(
  id: string,
  data: z.input<typeof UpdateReceiptSchema>
) {
  const parsed = UpdateReceiptSchema.parse(data);
  return withRequestTenant(async () => {
  await connectDB();
  const Receipt = await currentModel(ReceiptModel);
  const doc = await Receipt.findByIdAndUpdate(
    id,
    { ...parsed, date: safeDate(parsed.date) },
    { new: true, select: 'store date total filePath verified' }
  ).lean();
  // Mirror-on-verify: once a receipt is confirmed, push its file to the remote
  // backend (when the auto-mirror toggle is on). Fire-and-forget.
  if (doc?.verified && doc.filePath) {
    void mirrorFileToRemote({ kind: 'receipts', store: doc.store, date: doc.date, total: doc.total, id: doc._id }, doc.filePath);
  }
  revalidatePath('/receipts');
  });
}

/** Confirm a receipt fast from Quick-verify: updates only the headline fields
 *  (store/date/total/net/VAT) + marks verified — leaves line items untouched. */
export async function quickVerifyReceipt(
  id: string,
  fields: { store: string; date: string; total: number; subtotal?: number; vatAmount?: number }
): Promise<{ ok: boolean }> {
  return withRequestTenant(async () => {
  await connectDB();
  const Receipt = await currentModel(ReceiptModel);
  const doc = await Receipt.findByIdAndUpdate(
    id,
    {
      $set: {
        store: fields.store.trim() || 'Unknown store',
        date: safeDate(fields.date),
        total: Number(fields.total) || 0,
        subtotal: Number(fields.subtotal) || 0,
        vatAmount: Number(fields.vatAmount) || 0,
        verified: true,
      },
    },
    { new: true, select: 'store date total filePath verified' }
  ).lean();
  if (doc?.filePath) {
    void mirrorFileToRemote({ kind: 'receipts', store: doc.store, date: doc.date, total: doc.total, id: doc._id }, doc.filePath);
  }
  revalidatePath('/receipts');
  return { ok: true };
  });
}

export type RescanResult = {
  ok: boolean;
  aiUsed: boolean;
  model?: string;
  aiError?: string;
  error?: string;
  receipt?: SerializedReceipt; // the updated doc, so the open detail can re-sync without reopening
};

/**
 * Re-run the AI parse on a receipt's stored file and overwrite the parsed fields.
 * `useOcr` forces the OCR path (rasterize PDF / Tesseract image → text model);
 * otherwise uses embedded PDF text or the vision model. Resets `verified` so the
 * user re-checks the fresh result. Used from the receipt detail + bulk re-scan.
 */
export async function rescanReceipt(id: string, useOcr: boolean): Promise<RescanResult> {
  return withRequestTenant(() => rescanReceiptOne(id, useOcr));
}

/** Internal: assumes the tenant context is already established (called inside a
 *  `withRequestTenant` by both `rescanReceipt` and `rescanReceiptsBulk`). */
async function rescanReceiptOne(id: string, useOcr: boolean): Promise<RescanResult> {
  await connectDB();
  const Receipt = await currentModel(ReceiptModel);
  const receipt = await Receipt.findById(id);
  if (!receipt?.filePath) return { ok: false, aiUsed: false, error: 'Receipt or file not found' };

  let bytes: Buffer;
  try {
    bytes = await readFile(receipt.filePath);
  } catch {
    return { ok: false, aiUsed: false, error: 'File missing from storage' };
  }

  const ext = receipt.filePath.split('.').pop()?.toLowerCase() || 'jpg';
  const isPdf = /pdf/i.test(receipt.fileType) || ext === 'pdf';
  const { parsed, raw, model, aiError } = await runReceiptParse(bytes, ext, isPdf, useOcr ? 'ocr' : 'no-ocr');

  if (parsed) {
    // `store` is required — never blank it out if the parse came back empty.
    receipt.store = parsed.store?.trim() || receipt.store || 'Unknown store';
    receipt.date = safeDate(parsed.date);
    receipt.total = parsed.total ?? 0;
    receipt.subtotal = parsed.subtotal ?? 0;
    receipt.vatAmount = parsed.vatAmount ?? 0;
    receipt.warrantyMonths = parsed.warrantyMonths || (await getAppSettings()).defaultWarrantyMonths;
    receipt.currency = parsed.currency || 'EUR';
    receipt.paymentMethod = parsed.paymentMethod || '';
    receipt.lineItems = cleanLineItems(parsed.lineItems, (await getAppSettings()).defaultVatRate) as typeof receipt.lineItems;
    receipt.verified = false;
    receipt.aiParsedAt = new Date();
  }
  receipt.rawAiResponse = raw;
  receipt.aiModel = model;
  try {
    await receipt.save();
  } catch (e) {
    return { ok: false, aiUsed: false, error: `Save failed: ${(e as Error).message.slice(0, 120)}` };
  }

  safeRevalidate('/receipts');
  return { ok: true, aiUsed: !!parsed, model, aiError, receipt: JSON.parse(JSON.stringify(receipt)) };
}

/**
 * Re-scan a batch of receipts by EXPLICIT ids (the client passes the current failed
 * set and loops over chunks — single pass, always terminates, even for receipts
 * that stay empty). `recovered` counts the ones that now have a total or items.
 * Capped per call so one request can't run for many minutes.
 */
export async function rescanReceiptsBulk(
  ids: string[],
  useOcr = true
): Promise<{ ok: boolean; recovered: number; processed: number }> {
  return withRequestTenant(async () => {
  await connectDB();
  const Receipt = await currentModel(ReceiptModel);
  const batch = ids.slice(0, 6); // bound wall-time per call (~6 × up-to-45s)
  let recovered = 0;
  for (const id of batch) {
    try {
      const r = await rescanReceiptOne(id, useOcr);
      if (r.ok && r.receipt && (r.receipt.total > 0 || (r.receipt.lineItems?.length ?? 0) > 0)) recovered++;
    } catch {
      // One bad receipt must not abort the batch.
      await Receipt.findByIdAndUpdate(id, { aiModel: 'ocr-error' }).catch(() => {});
    }
  }
  revalidatePath('/receipts');
  return { ok: true, recovered, processed: batch.length };
  });
}

/**
 * Add a receipt's line items to the Item library using their AI-refined names.
 * Creates new Items (or matches existing by title), and wires up the two-way
 * link: receipt.itemIds ↔ item.receiptIds ↔ lineItem.matchedItemId.
 * So searching an item later jumps straight to its receipt.
 */
export async function addReceiptItemsToLibrary(
  receiptId: string
): Promise<{ ok: boolean; created: number; linked: number; error?: string }> {
  return withRequestTenant(async () => {
  await connectDB();
  const Receipt = await currentModel(ReceiptModel);
  const Item = await currentModel(ItemModel);
  const receipt = await Receipt.findById(receiptId);
  if (!receipt) return { ok: false, created: 0, linked: 0, error: 'Receipt not found' };

  let created = 0;
  let linked = 0;
  const receiptItemIds: Types.ObjectId[] = [];
  const rid = receipt._id as unknown as Types.ObjectId;

  // Warranty end = purchase date + warranty months (receipt's own, else the
  // configurable default from Settings → Defaults).
  const { defaultWarrantyMonths } = await getAppSettings();
  const warrantyUntil = new Date(receipt.date);
  warrantyUntil.setMonth(warrantyUntil.getMonth() + (receipt.warrantyMonths || defaultWarrantyMonths));

  for (const li of receipt.lineItems) {
    const title = (li.refinedName || li.name || '').trim();
    if (!title) continue;

    // li.price is the NET unit price; the item should carry the price actually
    // paid, i.e. WITH VAT (gross unit price).
    const grossUnit = Math.round(li.price * (1 + (li.vatRate || 0) / 100) * 100) / 100;

    // find-or-create avoids the $addToSet + schema-default upsert conflict
    let item = await Item.findOne({ title });
    if (!item) {
      item = await Item.create({
        title,
        status: 'received',
        category: 'other',
        currentPrice: grossUnit,
        purchasedPrice: grossUnit,
        purchasedFrom: receipt.store,
        purchasedAt: receipt.date,
        warrantyUntil,
        tags: [receipt.store].filter(Boolean),
        receiptIds: [rid],
      });
      created++;
    } else {
      if (!item.receiptIds.some((id) => String(id) === String(rid))) {
        item.receiptIds.push(rid);
        await item.save();
      }
      linked++;
    }

    li.matchedItemId = item._id as unknown as Types.ObjectId;
    receiptItemIds.push(item._id as unknown as Types.ObjectId);
  }

  // de-dupe and persist receipt.itemIds
  const merged = new Set([
    ...receipt.itemIds.map((x) => String(x)),
    ...receiptItemIds.map((x) => String(x)),
  ]);
  receipt.itemIds = [...merged].map((s) => new Types.ObjectId(s)) as unknown as typeof receipt.itemIds;
  await receipt.save();

  revalidatePath('/receipts');
  revalidatePath('/items');
  return { ok: true, created, linked };
  });
}

/** Generate missing 1st-page thumbnails for PDF receipts (self-heals old ones). */
export async function backfillReceiptThumbs(limit = 12): Promise<number> {
  return withRequestTenant(async () => {
  await connectDB();
  const Receipt = await currentModel(ReceiptModel);
  const pending = await Receipt.find({
    fileType: /pdf/i,
    $or: [{ thumbPath: { $exists: false } }, { thumbPath: '' }],
  }).limit(limit);
  let done = 0;
  for (const r of pending) {
    if (!r.filePath) continue;
    try {
      const buf = await readFile(r.filePath);
      const jpeg = await pdfFirstPageJpeg(buf, 480);
      if (jpeg) {
        r.thumbPath = (await saveFile('receipts', jpeg, 'jpg')).relativePath;
        await r.save();
        done++;
      }
    } catch {
      /* skip this one */
    }
  }
  return done;
  });
}

export async function deleteReceipt(id: string) {
  return withRequestTenant(async () => {
  await connectDB();
  const Receipt = await currentModel(ReceiptModel);
  // Soft delete → Trash (Settings → Storage & data). Files and item links stay
  // intact so a restore brings everything back; purging from the Trash deletes
  // the files and drops the references for real.
  await Receipt.updateOne({ _id: id }, { $set: { deletedAt: new Date() } });
  revalidatePath('/receipts');
  revalidatePath('/items');
  });
}

/** Mark a receipt as "not a real receipt" (or restore it). Archived ones are
 *  hidden from the list and never counted as failed / re-scan candidates. */
export async function archiveReceipt(id: string, value: boolean): Promise<{ ok: boolean }> {
  return withRequestTenant(async () => {
  await connectDB();
  const Receipt = await currentModel(ReceiptModel);
  await Receipt.updateOne({ _id: id }, { $set: { archived: value } });
  revalidatePath('/receipts');
  return { ok: true };
  });
}

// ─── Duplicate detection + merge ─────────────────────────────────────────────
// Email imports often overlap with manually-scanned receipts (same purchase from
// two sources). Group by store + day + total, surface the clusters, and let the
// user merge each — keeping the most complete record and re-pointing item links.

export type DupReceipt = {
  _id: string;
  store: string;
  date: string;
  total: number;
  verified: boolean;
  lineItemCount: number;
  itemCount: number;
  fileType: string;
  thumbPath: string;
  filePath: string;
  aiModel: string;
};
export type DupGroup = { key: string; receipts: DupReceipt[] };

/** Stable signature for "the same purchase": normalized store + day + total. */
function dupKey(store: string, date: string | Date | null, total: number): string {
  const s = (store || '')
    .toLowerCase()
    .replace(/[^a-z0-9α-ω]+/gi, '')
    .slice(0, 20);
  const d = date ? new Date(date) : null;
  const day = d && !isNaN(d.getTime()) ? `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}` : 'nodate';
  return `${s}|${total.toFixed(2)}|${day}`;
}

/**
 * Find clusters of likely-duplicate receipts. Only considers receipts with a
 * positive total (empty drafts would false-positive en masse). A "completeness"
 * sort puts the best candidate (verified + most line items) first in each group,
 * so the UI can default to keeping it.
 */
export async function findDuplicateReceipts(): Promise<DupGroup[]> {
  return withRequestTenant(async () => {
  await connectDB();
  const Receipt = await currentModel(ReceiptModel);
  const receipts = await Receipt.find({ total: { $gt: 0 } })
    .select('store date total verified lineItems itemIds filePath thumbPath fileType aiModel')
    .lean();

  const groups = new Map<string, DupReceipt[]>();
  for (const r of receipts as Array<Record<string, unknown>>) {
    const total = Number(r.total) || 0;
    const key = dupKey(String(r.store ?? ''), (r.date as string) ?? null, total);
    const entry: DupReceipt = {
      _id: String(r._id),
      store: String(r.store ?? 'Unknown'),
      date: r.date ? String(r.date) : '',
      total,
      verified: !!r.verified,
      lineItemCount: Array.isArray(r.lineItems) ? r.lineItems.length : 0,
      itemCount: Array.isArray(r.itemIds) ? r.itemIds.length : 0,
      fileType: String(r.fileType ?? ''),
      thumbPath: String(r.thumbPath ?? ''),
      filePath: String(r.filePath ?? ''),
      aiModel: String(r.aiModel ?? ''),
    };
    const list = groups.get(key);
    if (list) list.push(entry);
    else groups.set(key, [entry]);
  }

  const out: DupGroup[] = [];
  for (const [key, list] of groups) {
    if (list.length < 2) continue;
    // Most complete first: verified, then most line items, then most linked items
    list.sort(
      (a, b) =>
        Number(b.verified) - Number(a.verified) ||
        b.lineItemCount - a.lineItemCount ||
        b.itemCount - a.itemCount
    );
    out.push({ key, receipts: list });
  }
  // Biggest/most-valuable clusters first
  out.sort((a, b) => b.receipts.length - a.receipts.length || (b.receipts[0]?.total ?? 0) - (a.receipts[0]?.total ?? 0));
  return out;
  });
}

/**
 * Merge duplicate receipts into one. Backfills missing fields on the kept record
 * from the dropped ones, unions their linked items, re-points every item's
 * receiptIds at the survivor, then deletes the dropped receipts (and their files).
 */
export async function mergeReceipts(
  keepId: string,
  dropIds: string[]
): Promise<{ ok: boolean; merged: number; error?: string }> {
  return withRequestTenant(async () => {
  await connectDB();
  const Receipt = await currentModel(ReceiptModel);
  const Item = await currentModel(ItemModel);
  const keep = await Receipt.findById(keepId);
  if (!keep) return { ok: false, merged: 0, error: 'Receipt to keep not found' };

  const targets = dropIds.filter((id) => id && id !== keepId);
  const drops = await Receipt.find({ _id: { $in: targets } });
  if (drops.length === 0) return { ok: false, merged: 0, error: 'No receipts to merge' };

  const keepOid = new Types.ObjectId(String(keep._id));
  for (const d of drops) {
    if ((!keep.lineItems || keep.lineItems.length === 0) && d.lineItems?.length) {
      keep.lineItems = d.lineItems;
      keep.subtotal = keep.subtotal || d.subtotal;
      keep.vatAmount = keep.vatAmount || d.vatAmount;
    }
    if (!keep.verified && d.verified) keep.verified = true;
    if (!keep.warrantyMonths && d.warrantyMonths) keep.warrantyMonths = d.warrantyMonths;
    if (!keep.paymentMethod && d.paymentMethod) keep.paymentMethod = d.paymentMethod;
    if (!keep.notes && d.notes) keep.notes = d.notes;
    for (const id of d.itemIds ?? []) {
      if (!keep.itemIds.some((x) => String(x) === String(id))) keep.itemIds.push(id);
    }
  }
  keep.markModified('lineItems');
  keep.markModified('itemIds');
  await keep.save();

  for (const d of drops) {
    const dOid = new Types.ObjectId(String(d._id));
    // Re-point linked items to the survivor (addToSet then pull — separate ops so
    // the two field updates don't conflict in one statement).
    await Item.updateMany({ receiptIds: dOid }, { $addToSet: { receiptIds: keepOid } });
    await Item.updateMany({ receiptIds: dOid }, { $pull: { receiptIds: dOid } });
    if (d.filePath) {
      try {
        await deleteFile(d.filePath);
      } catch {
        /* file already gone */
      }
    }
    if (d.thumbPath) {
      try {
        await deleteFile(d.thumbPath);
      } catch {
        /* thumb already gone */
      }
    }
  }
  await Receipt.deleteMany({ _id: { $in: drops.map((d) => d._id) } });

  revalidatePath('/receipts');
  revalidatePath('/items');
  return { ok: true, merged: drops.length };
  });
}

// ─── Email receipt import ────────────────────────────────────────────────────
// `scripts/extract-email-receipts.py` drops the PDF/image attachments from a Gmail
// Takeout MBOX into /storage/email-inbox (+ manifest.json with sender/date/subject).
// We ingest them as DRAFT receipts (fast, no AI) — they then show as "failed" and
// the existing "re-scan all (OCR)" background job parses them (auto-rotate OCR).

const EMAIL_INBOX = path.join(process.env.STORAGE_ROOT ?? '/storage', 'email-inbox');
const INBOX_EXT = /\.(pdf|jpe?g|png|webp|html?)$/i;

/** A friendly store hint from the sender domain, until AI reads the real name. */
function storeHint(from?: string, file?: string): string {
  const m = (from || '').match(/@([\w.-]+)/) || (file || '').match(/^([a-z0-9-]+)_/i);
  const dom = (m?.[1] || '').split('.').slice(-2)[0] || '';
  if (!dom || dom === 'gmail' || dom === 'com' || dom.length < 3) return 'Unknown store';
  return dom.charAt(0).toUpperCase() + dom.slice(1);
}

/** How many attachment files are staged in the email inbox, waiting to import. */
export async function getEmailInboxCount(): Promise<number> {
  try {
    return (await fs.readdir(EMAIL_INBOX)).filter((f) => INBOX_EXT.test(f)).length;
  } catch {
    return 0; // no inbox dir
  }
}

/** Ingest every staged email attachment as a draft receipt, then move it to done/. */
export async function importEmailInbox(): Promise<{ ok: boolean; imported: number; skipped: number; error?: string }> {
  return withRequestTenant(async () => {
  await connectDB();
  const Receipt = await currentModel(ReceiptModel);
  let files: string[];
  try {
    files = (await fs.readdir(EMAIL_INBOX)).filter((f) => INBOX_EXT.test(f));
  } catch {
    return { ok: false, imported: 0, skipped: 0, error: 'No email-inbox folder' };
  }
  if (files.length === 0) return { ok: true, imported: 0, skipped: 0 };

  const manifest: Record<string, { from?: string; subject?: string; date?: string }> = {};
  try {
    const arr = JSON.parse(await fs.readFile(path.join(EMAIL_INBOX, 'manifest.json'), 'utf8')) as Array<{
      file: string; from?: string; subject?: string; date?: string;
    }>;
    for (const m of arr) manifest[m.file] = m;
  } catch {
    /* manifest is optional */
  }

  const doneDir = path.join(EMAIL_INBOX, 'done');
  await fs.mkdir(doneDir, { recursive: true }).catch(() => {});

  let imported = 0;
  let skipped = 0;
  for (const f of files) {
    const full = path.join(EMAIL_INBOX, f);
    try {
      const bytes = await fs.readFile(full);
      const ext = (f.split('.').pop() || 'pdf').toLowerCase();
      const isPdf = ext === 'pdf';
      const { relativePath } = await saveFile('receipts', bytes, isPdf ? 'pdf' : ext);
      let thumbPath = '';
      if (isPdf) {
        const jpeg = await pdfFirstPageJpeg(bytes, 480);
        if (jpeg) {
          try {
            thumbPath = (await saveFile('receipts', jpeg, 'jpg')).relativePath;
          } catch {
            /* thumb is best-effort */
          }
        }
      }
      const meta = manifest[f] || {};
      const d = meta.date ? new Date(meta.date) : null;
      await Receipt.create({
        store: storeHint(meta.from, f),
        date: d && !Number.isNaN(d.getTime()) ? d : new Date(),
        total: 0,
        filePath: relativePath,
        fileType: isPdf ? 'application/pdf' : ext === 'html' || ext === 'htm' ? 'text/html' : `image/${ext}`,
        thumbPath,
        aiModel: 'email-import',
        aiParsedAt: null,
        verified: false,
        notes: meta.subject ? `📧 ${meta.subject}`.slice(0, 200) : 'Imported from email',
      });
      imported++;
      await fs.rename(full, path.join(doneDir, f)).catch(() => {});
    } catch {
      skipped++;
    }
  }
  revalidatePath('/receipts');
  return { ok: true, imported, skipped };
  });
}
