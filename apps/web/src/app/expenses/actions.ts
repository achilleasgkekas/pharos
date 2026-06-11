'use server';
import { connectDB } from '@/lib/db';
import { Expense } from '@/models/Expense';
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

/** Inherit category / recurring from an existing record of the same vendor (the
 *  "continuity" the user asked for: a new ΔΕΗ bill joins the existing ΔΕΗ series). */
async function inheritFromSeries(kind: Kind, vKey: string): Promise<{ category?: string; recurring?: boolean; recurringCycle?: string } | null> {
  if (!vKey) return null;
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
  await connectDB();
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
}

export type UploadExpenseResult = { ok: true; id: string; aiUsed: boolean; aiError?: string } | { ok: false; error: string };

/** Upload + scan a bill/payslip → draft Expense (verified:false) for the user to confirm. */
// Matches next.config serverActions.bodySizeLimit; also bounds in-memory buffering + OCR.
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

export async function uploadExpense(formData: FormData): Promise<UploadExpenseResult> {
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
  try {
    await connectDB();
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
}

/** Manual entry (no file) — e.g. type in a salary or a cash expense. */
export async function addExpense(data: z.input<typeof UpdateSchema>): Promise<{ ok: boolean; id?: string; error?: string }> {
  const p = UpdateSchema.safeParse(data);
  if (!p.success) return { ok: false, error: 'Invalid data' };
  const d = p.data;
  try {
    await connectDB();
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
}

export async function deleteExpense(id: string): Promise<{ ok: boolean }> {
  try {
    await connectDB();
    // Soft delete → Trash (Settings → Storage & data). Files stay until purge.
    await Expense.updateOne({ _id: id }, { $set: { deletedAt: new Date() } });
    revalidatePath('/expenses');
    revalidatePath('/income');
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

/** Re-run the AI on the stored file (text or forced OCR). Returns the updated record. */
export async function rescanExpense(id: string, useOcr: boolean): Promise<{ ok: boolean; expense?: SerializedExpense; error?: string }> {
  try {
    await connectDB();
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
}
