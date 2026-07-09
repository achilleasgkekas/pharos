'use server';
import { connectDB } from '@/lib/db';
import { Expense as ExpenseModel } from '@/models/Expense';
import { withRequestTenant } from '@/lib/tenancy/request';
import { currentModel } from '@/lib/tenancy/connection';
import { saveFile, deleteFile } from '@/lib/storage';
import { parseExpenseText, parseExpenseImage } from '@/lib/ollama';
import { isFeatureEnabled } from '@/lib/aiFeatures.server';
import { extractPdfText, looksLikeScannedPdf } from '@/lib/pdf';
import { ocrImage, looksLikeUsableOcr } from '@/lib/ocr';
import { pdfFirstPageJpeg } from '@/lib/pdfThumb';
import { safeDate } from '@/lib/dates';
import { getAppSettings } from '@/lib/appSettings';
import { mirrorFileToRemote } from '@/lib/mirror';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { SerializedExpense } from '@/types';
import type { ParsedExpense } from '@/lib/ollama';
import { vendorKey, serializeExpense } from './lib';
import { csvDedupeKey } from '@/lib/csvImport';

type Kind = 'income' | 'expense';
function asKind(v: unknown): Kind {
  return v === 'income' ? 'income' : 'expense';
}

type ParseOut = { parsed: ParsedExpense | null; raw: string; model: string; aiError?: string };

/** Scan a bill/payslip file → structured income/expense. Mirrors the receipt pipeline. */
async function runExpenseParse(bytes: Buffer, ext: string, isPdf: boolean, useOcr: boolean): Promise<ParseOut> {
  try {
    if (isPdf) {
      const text = await extractPdfText(bytes);
      if (!looksLikeScannedPdf(text) && !useOcr) {
        const r = await parseExpenseText(text);
        return { parsed: r.parsed, raw: r.raw, model: r.model };
      }
      const img = await pdfFirstPageJpeg(bytes, 1654);
      if (!img) return { parsed: null, raw: '', model: '', aiError: 'Could not rasterize the PDF' };
      const ocrText = await ocrImage(img, 'jpg');
      if (looksLikeUsableOcr(ocrText)) {
        const r = await parseExpenseText(ocrText);
        return { parsed: r.parsed, raw: r.raw, model: `ocr-pdf+${r.model}` };
      }
      const r = await parseExpenseImage(img.toString('base64'));
      return { parsed: r.parsed, raw: r.raw, model: `vision-pdf+${r.model}` };
    }
    // Image
    const ocrText = await ocrImage(bytes, ext);
    if (looksLikeUsableOcr(ocrText)) {
      const r = await parseExpenseText(ocrText);
      return { parsed: r.parsed, raw: r.raw, model: `ocr+${r.model}` };
    }
    const r = await parseExpenseImage(bytes.toString('base64'));
    return { parsed: r.parsed, raw: r.raw, model: r.model };
  } catch (err) {
    const msg = (err as Error).message || String(err);
    return { parsed: null, raw: '', model: '', aiError: `AI parse failed: ${msg.slice(0, 120)}` };
  }
}

type ScanExpenseResult = { ok: true; data: ParsedExpense } | { ok: false; error: string };

function scanError(err: unknown): string {
  const msg = (err as Error)?.message || String(err);
  return `AI scan failed: ${msg.slice(0, 140)}`;
}

/** Parse pasted bill/payslip text into a structured income/expense WITHOUT saving.
 *  Mirrors scanVoucherText: the mobile/web client uses the result to prefill a form. */
export async function scanExpenseText(text: string): Promise<ScanExpenseResult> {
  if (!(await isFeatureEnabled('expenses'))) return { ok: false, error: 'Bill scanning (AI) is turned off.' };
  if (!text.trim()) return { ok: false, error: 'Paste some bill text first' };
  try {
    const r = await parseExpenseText(text);
    return { ok: true, data: r.parsed };
  } catch (err) {
    return { ok: false, error: scanError(err) };
  }
}

/** OCR/vision a bill or payslip photo/PDF into a structured income/expense WITHOUT
 *  saving. Reuses the receipt-grade pipeline (OCR-first, vision fallback). */
export async function scanExpenseImage(formData: FormData): Promise<ScanExpenseResult> {
  if (!(await isFeatureEnabled('expenses'))) return { ok: false, error: 'Bill scanning (AI) is turned off.' };
  const file = formData.get('file');
  if (!file || !(file instanceof File) || file.size === 0) return { ok: false, error: 'No file' };
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, error: 'File too large (max 15MB)' };
  try {
    const ext = (file.name.split('.').pop() || 'bin').toLowerCase();
    const isPdf = ext === 'pdf' || file.type === 'application/pdf';
    const bytes = Buffer.from(await file.arrayBuffer());
    const { parsed, aiError } = await runExpenseParse(bytes, ext, isPdf, false);
    if (!parsed) return { ok: false, error: aiError || 'AI returned nothing' };
    return { ok: true, data: parsed };
  } catch (err) {
    return { ok: false, error: scanError(err) };
  }
}

/** Inherit category / recurring from an existing record of the same vendor (the
 *  "continuity" the user asked for: a new ΔΕΗ bill joins the existing ΔΕΗ series). */
async function inheritFromSeries(kind: Kind, vKey: string): Promise<{ category?: string; recurring?: boolean; recurringCycle?: string } | null> {
  if (!vKey) return null;
  const Expense = await currentModel(ExpenseModel);
  const prev = await Expense.findOne({ kind, vendorKey: vKey }).sort({ date: -1 }).lean();
  if (!prev) return null;
  return { category: prev.category, recurring: prev.recurring, recurringCycle: prev.recurringCycle };
}

function periodFrom(date: Date, parsedPeriod?: string): string {
  if (parsedPeriod && /^\d{4}-\d{2}$/.test(parsedPeriod)) return parsedPeriod;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** Advance a date by one billing cycle. */
function addCycle(d: Date, cycle: string): Date {
  const n = new Date(d);
  if (cycle === 'weekly') n.setDate(n.getDate() + 7);
  else if (cycle === 'quarterly') n.setMonth(n.getMonth() + 3);
  else if (cycle === 'yearly') n.setFullYear(n.getFullYear() + 1);
  else n.setMonth(n.getMonth() + 1); // monthly default
  return n;
}

/**
 * Auto-create the next entries for recurring expenses/income. Seeds from the LATEST
 * entry of each recurring series (kind+vendorKey) and steps forward by its cycle,
 * filling any missing periods up to today. Idempotent: each run re-seeds from the new
 * latest, so it never duplicates. Called (awaited) on the expenses/income page load.
 */
export async function generateDueRecurring(): Promise<{ created: number }> {
  return withRequestTenant(async () => {
  await connectDB();
  const Expense = await currentModel(ExpenseModel);
  const recurring = await Expense.find({
    recurring: true,
    recurringCycle: { $nin: ['', null] },
    amount: { $gt: 0 },
  })
    .sort({ date: -1 })
    .lean();

  // Latest entry per series (kind|vendorKey); skip series with no vendorKey.
  const seen = new Set<string>();
  const seeds: typeof recurring = [];
  for (const e of recurring) {
    const k = `${e.kind}|${e.vendorKey}`;
    if (!e.vendorKey || seen.has(k)) continue;
    seen.add(k);
    seeds.push(e);
  }

  const now = Date.now();
  let created = 0;
  for (const seed of seeds) {
    const cycle = String(seed.recurringCycle);
    let next = addCycle(new Date(seed.date), cycle);
    let guard = 0;
    while (next.getTime() <= now && guard < 36) {
      guard++;
      await Expense.create({
        kind: seed.kind,
        vendor: seed.vendor,
        vendorKey: seed.vendorKey,
        category: seed.category,
        amount: seed.amount,
        date: next,
        period: `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`,
        recurring: true,
        recurringCycle: seed.recurringCycle,
        aiModel: 'recurring-auto',
        verified: false,
        notes: 'Auto-generated from recurring series',
      });
      created++;
      next = addCycle(next, cycle);
    }
  }

  if (created) {
    revalidatePath('/expenses');
    revalidatePath('/income');
  }
  return { created };
  });
}

export type UploadExpenseResult = { ok: true; id: string; aiUsed: boolean; aiError?: string } | { ok: false; error: string };

/** Upload + scan a bill/payslip → draft Expense (verified:false) for the user to confirm. */
// Matches next.config serverActions.bodySizeLimit; also bounds in-memory buffering + OCR.
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

export async function uploadExpense(formData: FormData): Promise<UploadExpenseResult> {
  return withRequestTenant(async () => {
  const file = formData.get('file');
  const kind = asKind(formData.get('kind'));
  if (!file || !(file instanceof File) || file.size === 0) return { ok: false, error: 'No file found' };
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, error: 'File too large (max 15MB)' };

  const ext = (file.name.split('.').pop() || 'bin').toLowerCase();
  const isPdf = ext === 'pdf' || file.type === 'application/pdf';
  const bytes = Buffer.from(await file.arrayBuffer());

  let relativePath = '';
  let thumbPath = '';
  try {
    relativePath = (await saveFile('expenses', bytes, isPdf ? 'pdf' : ext)).relativePath;
    if (isPdf) {
      const jpeg = await pdfFirstPageJpeg(bytes, 900);
      if (jpeg) thumbPath = (await saveFile('expenses', jpeg, 'jpg')).relativePath;
    }
  } catch (err) {
    return { ok: false, error: `Could not save file: ${(err as Error).message}` };
  }

  // When expense-AI is off, skip parsing and keep the upload as a draft to fill in manually.
  const { parsed, raw, model, aiError } = (await isFeatureEnabled('expenses'))
    ? await runExpenseParse(bytes, ext, isPdf, false)
    : { parsed: null, raw: '', model: 'ai-off', aiError: 'AI is off — saved as a draft to fill in manually.' };

  try {
    await connectDB();
    const Expense = await currentModel(ExpenseModel);
    const date = safeDate(parsed?.date);
    const vendor = parsed?.vendor || '';
    const vKey = vendorKey(vendor);
    const inherited = await inheritFromSeries(kind, vKey);
    const exp = await Expense.create({
      kind: parsed?.kind || kind,
      vendor,
      vendorKey: vKey,
      category: parsed?.category || inherited?.category || 'other',
      amount: parsed?.amount ?? 0,
      currency: parsed?.currency || 'EUR',
      date,
      period: periodFrom(date, parsed?.period),
      recurring: inherited?.recurring ?? false,
      recurringCycle: (parsed?.recurringCycle || inherited?.recurringCycle || '') as '' | 'monthly' | 'quarterly' | 'yearly' | 'weekly',
      paymentMethod: parsed?.paymentMethod || '',
      filePath: relativePath,
      fileType: file.type || (isPdf ? 'application/pdf' : `image/${ext}`),
      thumbPath,
      fileSize: file.size,
      rawAiResponse: raw,
      aiModel: model,
      aiParsedAt: parsed ? new Date() : null,
      verified: false,
    });
    // Auto-mirror to the remote backend when enabled — fire-and-forget, never blocks.
    void mirrorFileToRemote({ kind: 'expenses', store: exp.vendor, date: exp.date, total: exp.amount, id: exp._id }, relativePath);
    revalidatePath('/expenses');
    revalidatePath('/income');
    return { ok: true, id: String(exp._id), aiUsed: !!parsed, aiError };
  } catch (err) {
    return { ok: false, error: `Could not save: ${(err as Error).message}` };
  }
  });
}

const UpdateSchema = z.object({
  kind: z.enum(['income', 'expense']).default('expense'),
  vendor: z.string().default(''),
  category: z.string().default('other'),
  amount: z.coerce.number().default(0),
  currency: z.string().default('EUR'),
  date: z.string(),
  period: z.string().default(''),
  recurring: z.boolean().default(false),
  recurringCycle: z.enum(['monthly', 'quarterly', 'yearly', 'weekly', '']).default(''),
  paymentMethod: z.string().default(''),
  notes: z.string().default(''),
  verified: z.boolean().default(false),
});

export async function updateExpense(id: string, data: z.input<typeof UpdateSchema>): Promise<{ ok: boolean; error?: string }> {
  const p = UpdateSchema.safeParse(data);
  if (!p.success) return { ok: false, error: 'Invalid data' };
  const d = p.data;
  return withRequestTenant(async () => {
  try {
    await connectDB();
    const Expense = await currentModel(ExpenseModel);
    const date = safeDate(d.date);
    await Expense.updateOne(
      { _id: id },
      {
        $set: {
          kind: d.kind,
          vendor: d.vendor,
          vendorKey: vendorKey(d.vendor),
          category: d.category,
          amount: d.amount,
          currency: d.currency,
          date,
          period: d.period || periodFrom(date),
          recurring: d.recurring,
          recurringCycle: d.recurringCycle,
          paymentMethod: d.paymentMethod,
          notes: d.notes,
          verified: d.verified,
        },
      }
    );
    revalidatePath('/expenses');
    revalidatePath('/income');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
  });
}

/** Manual entry (no file) — e.g. type in a salary or a cash expense. */
export async function addExpense(data: z.input<typeof UpdateSchema>): Promise<{ ok: boolean; id?: string; error?: string }> {
  const p = UpdateSchema.safeParse(data);
  if (!p.success) return { ok: false, error: 'Invalid data' };
  const d = p.data;
  return withRequestTenant(async () => {
  try {
    await connectDB();
    const Expense = await currentModel(ExpenseModel);
    const date = safeDate(d.date);
    const inherited = await inheritFromSeries(d.kind, vendorKey(d.vendor));
    const exp = await Expense.create({
      kind: d.kind,
      vendor: d.vendor,
      vendorKey: vendorKey(d.vendor),
      category: d.category || inherited?.category || 'other',
      amount: d.amount,
      currency: d.currency,
      date,
      period: d.period || periodFrom(date),
      recurring: d.recurring || inherited?.recurring || false,
      recurringCycle: d.recurringCycle || (inherited?.recurringCycle as typeof d.recurringCycle) || '',
      paymentMethod: d.paymentMethod,
      notes: d.notes,
      verified: true,
    });
    revalidatePath('/expenses');
    revalidatePath('/income');
    return { ok: true, id: String(exp._id) };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
  });
}

export async function deleteExpense(id: string): Promise<{ ok: boolean }> {
  return withRequestTenant(async () => {
  try {
    await connectDB();
    const Expense = await currentModel(ExpenseModel);
    // Soft delete → Trash (Settings → Storage & data). Files stay until purge.
    await Expense.updateOne({ _id: id }, { $set: { deletedAt: new Date() } });
    revalidatePath('/expenses');
    revalidatePath('/income');
    return { ok: true };
  } catch {
    return { ok: false };
  }
  });
}

// ── Bank / generic CSV import (PA1) ─────────────────────────────────────────
// The client parses + column-maps the file (lib/csvImport) and sends clean rows;
// the server re-validates, dedupes against existing records AND within the batch,
// inherits category/recurring from each vendor's existing series, and inserts.
// Deterministic — zero AI calls. AI batch-categorise stays a separate opt-in step.

const CsvRowSchema = z.object({
  vendor: z.string().min(1).max(200),
  amount: z.number().finite(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  category: z.string().max(60).default(''),
  notes: z.string().max(500).default(''),
});

const MAX_CSV_ROWS_PER_CALL = 500;

export type CsvImportResult =
  | { ok: true; imported: number; skippedDupes: number }
  | { ok: false; error: string };

/**
 * Import mapped CSV rows as expenses/income.
 * `signSplit`: negative amounts → expense, positive → income (typical bank export);
 * otherwise every row gets `kind` and the sign is dropped (amounts stored positive).
 */
export async function importExpensesCsv(
  rows: Array<z.input<typeof CsvRowSchema>>,
  opts: { kind: Kind; signSplit: boolean }
): Promise<CsvImportResult> {
  if (!Array.isArray(rows) || rows.length === 0) return { ok: false, error: 'No rows to import' };
  if (rows.length > MAX_CSV_ROWS_PER_CALL) return { ok: false, error: `Too many rows (max ${MAX_CSV_ROWS_PER_CALL} per batch)` };
  const parsed = z.array(CsvRowSchema).safeParse(rows);
  if (!parsed.success) return { ok: false, error: 'Invalid rows' };
  const kind = asKind(opts.kind);

  return withRequestTenant(async () => {
    try {
      await connectDB();
      const Expense = await currentModel(ExpenseModel);

      const prepared = parsed.data.map((r) => {
        const rowKind: Kind = opts.signSplit ? (r.amount < 0 ? 'expense' : 'income') : kind;
        const vKey = vendorKey(r.vendor);
        return { ...r, kind: rowKind, vKey, amount: Math.abs(r.amount), key: csvDedupeKey(rowKind, vKey, r.date, r.amount) };
      });

      // Existing-record dedupe: one bounded query over the batch's date range.
      const dates = prepared.map((r) => new Date(`${r.date}T00:00:00Z`));
      const min = new Date(Math.min(...dates.map((d) => d.getTime())));
      const max = new Date(Math.max(...dates.map((d) => d.getTime())));
      max.setUTCDate(max.getUTCDate() + 1);
      const existing = await Expense.find({ date: { $gte: min, $lt: max } })
        .select('kind vendorKey date amount')
        .lean();
      const seen = new Set(
        existing.map((e) =>
          csvDedupeKey(e.kind === 'income' ? 'income' : 'expense', e.vendorKey || '', new Date(e.date).toISOString(), e.amount || 0)
        )
      );

      // Series inheritance (category/recurring) per vendor — one query per unique key.
      const inheritCache = new Map<string, Awaited<ReturnType<typeof inheritFromSeries>>>();
      async function inherited(rowKind: Kind, vKey: string) {
        const k = `${rowKind}|${vKey}`;
        if (!inheritCache.has(k)) inheritCache.set(k, await inheritFromSeries(rowKind, vKey));
        return inheritCache.get(k) ?? null;
      }

      const docs = [];
      let skippedDupes = 0;
      for (const r of prepared) {
        if (seen.has(r.key)) { skippedDupes++; continue; }
        seen.add(r.key); // intra-batch dedupe too
        const inh = r.category ? null : await inherited(r.kind, r.vKey);
        const date = new Date(`${r.date}T00:00:00Z`);
        docs.push({
          kind: r.kind,
          vendor: r.vendor,
          vendorKey: r.vKey,
          category: r.category || inh?.category || 'other',
          amount: r.amount,
          date,
          period: periodFrom(date),
          recurring: inh?.recurring ?? false,
          recurringCycle: (inh?.recurringCycle || '') as '' | 'monthly' | 'quarterly' | 'yearly' | 'weekly',
          notes: r.notes,
          aiModel: 'csv-import',
          verified: true, // deterministic bank data, not an AI guess — no review queue
        });
      }

      if (docs.length) await Expense.insertMany(docs);
      revalidatePath('/expenses');
      revalidatePath('/income');
      return { ok: true, imported: docs.length, skippedDupes };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  });
}

/** Re-run the AI on the stored file (text or forced OCR). Returns the updated record. */
export async function rescanExpense(id: string, useOcr: boolean): Promise<{ ok: boolean; expense?: SerializedExpense; error?: string }> {
  return withRequestTenant(async () => {
  try {
    await connectDB();
    const Expense = await currentModel(ExpenseModel);
    const exp = await Expense.findById(id);
    if (!exp || !exp.filePath) return { ok: false, error: 'No file to scan' };
    const { readFile } = await import('@/lib/storage');
    const bytes = await readFile(exp.filePath);
    const ext = (exp.filePath.split('.').pop() || 'bin').toLowerCase();
    const isPdf = ext === 'pdf';
    const { parsed, raw, model, aiError } = await runExpenseParse(bytes, ext, isPdf, useOcr);
    if (!parsed) return { ok: false, error: aiError || 'AI returned nothing' };
    const date = safeDate(parsed.date);
    exp.kind = parsed.kind || exp.kind;
    exp.vendor = parsed.vendor || exp.vendor;
    exp.vendorKey = vendorKey(exp.vendor);
    exp.category = parsed.category || exp.category;
    exp.amount = parsed.amount ?? exp.amount;
    exp.currency = parsed.currency || exp.currency;
    exp.date = date;
    exp.period = periodFrom(date, parsed.period);
    if (parsed.recurringCycle) exp.recurringCycle = parsed.recurringCycle;
    exp.paymentMethod = parsed.paymentMethod || exp.paymentMethod;
    exp.rawAiResponse = raw;
    exp.aiModel = model;
    exp.aiParsedAt = new Date();
    exp.verified = false;
    await exp.save();
    revalidatePath('/expenses');
    revalidatePath('/income');
    return { ok: true, expense: serializeExpense(exp.toObject()) };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
  });
}
