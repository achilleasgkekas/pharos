import { randomUUID } from 'node:crypto';
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
import { matchCategoryRule } from '@/lib/categoryRules';
import { mirrorFileToRemote } from '@/lib/mirror';
import { cleanSplit } from '@/lib/split';
import { cleanPaymentSplits } from '@/lib/paymentSplit';
import { addCycleUTC, RECURRING_CYCLE_VALUES, type RecurringCycle } from '@/lib/billingCycle';
import { syncGiftCardUses } from '@/lib/giftCardMirror';
import { recurringExpenseId, isDuplicateKey } from '@/lib/recurringExpenseId';
import { resolveFx, normalizeCurrency } from '@/lib/fx';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { SerializedExpense } from '@/types';
import type { ParsedExpense } from '@/lib/ollama';
import { vendorKey, serializeExpense } from './lib';
import { csvDedupeKey } from '@/lib/csvImport';
import { groupExpenseDupes, type ExpenseDupeGroup } from '@/lib/expenseDupes';
import { assertCanWrite } from '@/lib/auth';

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
 *  Mirrors scanVoucherText: the client uses the result to prefill a form. */
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
async function inheritFromSeries(kind: Kind, vKey: string, amount?: number): Promise<{ category?: string; recurring?: boolean; recurringCycle?: string; space?: string; taxDeductible?: boolean; taxCategory?: string; seriesId?: string } | null> {
  if (!vKey) return null;
  const Expense = await currentModel(ExpenseModel);
  const prev = await Expense.findOne({ kind, vendorKey: vKey }).sort({ date: -1 }).lean();
  if (!prev) return null;

  let seriesId = prev.seriesId;

  if (amount !== undefined && amount > 0) {
    if (prev.amount === amount) {
      seriesId = prev.seriesId;
    } else {
      const exactMatch = await Expense.findOne({ kind, vendorKey: vKey, amount, recurring: true }).sort({ date: -1 }).lean();
      if (exactMatch) {
        seriesId = exactMatch.seriesId;
      } else {
        // Did not match any existing series amount. Create a new parallel series id.
        seriesId = randomUUID().replace(/-/g, '').slice(0, 24);
      }
    }
  }

  return { category: prev.category, recurring: prev.recurring, recurringCycle: prev.recurringCycle, space: prev.space, taxDeductible: prev.taxDeductible, taxCategory: prev.taxCategory, seriesId };
}

function periodFrom(date: Date, parsedPeriod?: string): string {
  if (parsedPeriod && /^\d{4}-\d{2}$/.test(parsedPeriod)) return parsedPeriod;
  // UTC getters (#103): dates are date-only values stored at UTC midnight. Local getters put
  // 2024-05-01T00Z into April on any server west of UTC.
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Auto-create the next entries for recurring expenses/income. Seeds from the LATEST
 * entry of each recurring series (kind+vendorKey) and steps forward by its cycle,
 * filling any missing periods up to today. Idempotent: each run re-seeds from the new
 * latest, so it never duplicates. Called (awaited) on the expenses/income page load.
 */
export async function generateDueRecurring(): Promise<{ created: number }> {
  await assertCanWrite();
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

  // Latest entry per series; prefer seriesId, fallback to kind|vendorKey.
  // Skip series with no vendorKey unless they have a seriesId.
  const seen = new Set<string>();
  const seeds: typeof recurring = [];
  for (const e of recurring) {
    const k = e.seriesId ? `series|${e.seriesId}` : `${e.kind}|${e.vendorKey}`;
    if ((!e.vendorKey && !e.seriesId) || seen.has(k)) continue;
    seen.add(k);
    seeds.push(e);
  }

  const now = Date.now();
  const base = (await getAppSettings()).currency;
  let created = 0;
  for (const seed of seeds) {
    const cycle = String(seed.recurringCycle);
    let next = addCycleUTC(new Date(seed.date), cycle);
    let guard = 0;
    while (next.getTime() <= now && guard < 36) {
      guard++;
      // #69: the id is derived from the series and the period, so a concurrent run that decided
      // to create the same entry loses on the _id index instead of writing a second copy.
      const period = periodFrom(next);
      try {
        await Expense.create({
          _id: recurringExpenseId(String(seed.kind), String(seed.vendorKey), period, seed.seriesId),
          kind: seed.kind,
          vendor: seed.vendor,
          vendorKey: seed.vendorKey,
          category: seed.category,
          space: seed.space || '',
          taxDeductible: seed.taxDeductible || false,
          taxCategory: seed.taxCategory || '',
          // `amount` is base-denominated (lib/fx.ts), so a projection is base currency by
          // definition; don't inherit the seed's printed foreign code/rate.
          amount: seed.amount,
          currency: base,
          date: next,
          period,
          recurring: true,
          recurringCycle: seed.recurringCycle,
          seriesId: seed.seriesId || '',
          aiModel: 'recurring-auto',
          verified: false,
          notes: 'Auto-generated from recurring series',
        });
        created++;
      } catch (err) {
        // Someone else got there first (or the user trashed this projection and it still owns its
        // id): either way the slot is taken and re-creating it is exactly what #69 is about.
        if (!isDuplicateKey(err)) throw err;
      }
      next = addCycleUTC(next, cycle);
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
  await assertCanWrite();
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
    const inherited = await inheritFromSeries(kind, vKey, parsed?.amount);
    // Deterministic vendor→category auto-rule (P15). A user-defined rule is an explicit
    // instruction, so it wins over the AI guess and any inherited series category.
    const settings = await getAppSettings();
    const rule = matchCategoryRule(settings.categoryRules, { vendor });
    // The AI reports the currency printed on the bill. When that is NOT the base currency
    // we have no rate yet, so resolveFx keeps the printed number in `amount` (exactly the
    // old behaviour) and records origAmount/currency so the UI can ask for a rate instead
    // of silently folding e.g. $88 into a euro total.
    const fx = resolveFx({ amount: parsed?.amount ?? 0, currency: parsed?.currency }, settings.currency);
    const exp = await Expense.create({
      kind,
      vendor,
      vendorKey: vKey,
      category: rule?.category || parsed?.category || inherited?.category || 'other',
      space: inherited?.space || '', // inherit the ledger tag from the vendor's last entry (P34)
      taxDeductible: inherited?.taxDeductible || false, // inherit tax flag (P8) — e.g. a doctor's bill vendor stays tax-deductible
      taxCategory: inherited?.taxCategory || '',
      amount: fx.amount,
      currency: fx.currency,
      origAmount: fx.origAmount,
      fxRate: fx.fxRate,
      date,
      period: periodFrom(date, parsed?.period),
      recurring: rule?.recurring || inherited?.recurring || false,
      recurringCycle: (rule?.recurringCycle || parsed?.recurringCycle || inherited?.recurringCycle || '') as RecurringCycle,
      seriesId: (rule?.recurring || inherited?.recurring) ? (inherited?.seriesId || '') : '',
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
  space: z.string().max(40).default(''),
  taxDeductible: z.boolean().default(false),
  taxCategory: z.string().max(60).default(''),
  // Multi-currency (P9): `amount` is what the user typed — the PRINTED amount when
  // `currency` is foreign. resolveFx() turns it into the base-currency value to store.
  amount: z.coerce.number().default(0),
  currency: z.string().default(''),
  fxRate: z.coerce.number().min(0).default(0),
  date: z.string(),
  period: z.string().default(''),
  recurring: z.boolean().default(false),
  recurringCycle: z.enum(RECURRING_CYCLE_VALUES).default(''),
  paymentMethod: z.string().default(''),
  notes: z.string().default(''),
  // Expense splitting (P35): people who owe you a share of this expense.
  split: z
    .array(
      z.object({
        name: z.string().max(80).default(''),
        share: z.coerce.number().default(0),
        settled: z.boolean().default(false),
      })
    )
    .max(50)
    .default([]),
  // Payment-method split (P62): which of YOUR methods paid this one purchase.
  // Absent/empty = paid with the single `paymentMethod` field, i.e. unchanged.
  paymentSplits: z
    .array(
      z.object({
        method: z.string().max(80).default(''),
        amount: z.coerce.number().default(0),
        giftCardId: z.string().max(64).default(''),
      })
    )
    .max(20)
    .default([])
    // A malformed split is degraded to "no split" rather than rejected: it must never
    // be the reason a whole expense fails to save (same posture as P73's subscriptions).
    .catch([]),
  verified: z.boolean().default(false),
});

export async function updateExpense(id: string, data: z.input<typeof UpdateSchema>): Promise<{ ok: boolean; error?: string }> {
  await assertCanWrite();
  const p = UpdateSchema.safeParse(data);
  if (!p.success) return { ok: false, error: 'Invalid data' };
  const d = p.data;
  return withRequestTenant(async () => {
  try {
    await connectDB();
    const Expense = await currentModel(ExpenseModel);
    const existing = await Expense.findOne({ _id: id }).sort({ date: -1 }).lean();
    
    const date = safeDate(d.date);
    const splits = cleanPaymentSplits(d.paymentSplits);
    const fx = resolveFx({ amount: d.amount, currency: d.currency, fxRate: d.fxRate }, (await getAppSettings()).currency);
    
    const seriesId = d.recurring
      ? (existing?.recurring ? existing.seriesId : '')
      : '';
      
    await Expense.updateOne(
      { _id: id },
      {
        $set: {
          kind: d.kind,
          vendor: d.vendor,
          vendorKey: vendorKey(d.vendor),
          category: d.category,
          space: d.space.trim(),
          taxDeductible: d.taxDeductible,
          taxCategory: d.taxCategory.trim(),
          amount: fx.amount,
          currency: fx.currency,
          origAmount: fx.origAmount,
          fxRate: fx.fxRate,
          date,
          period: d.period || periodFrom(date),
          recurring: d.recurring,
          recurringCycle: d.recurringCycle,
          seriesId,
          paymentMethod: d.paymentMethod,
          notes: d.notes,
          split: cleanSplit(d.split),
          paymentSplits: splits,
          verified: d.verified,
        },
      }
    );
    await syncGiftCardUses(id, splits, date, d.vendor);
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
  await assertCanWrite();
  const p = UpdateSchema.safeParse(data);
  if (!p.success) return { ok: false, error: 'Invalid data' };
  const d = p.data;
  return withRequestTenant(async () => {
  try {
    await connectDB();
    const Expense = await currentModel(ExpenseModel);
    const date = safeDate(d.date);
    const splits = cleanPaymentSplits(d.paymentSplits);
    const inherited = await inheritFromSeries(d.kind, vendorKey(d.vendor), d.amount);
    // Apply a vendor→category auto-rule (P15) only when the user did NOT pick a category
    // (the form defaults to 'other'); an explicit choice always wins.
    const explicit = d.category && d.category !== 'other' ? d.category : '';
    const settings = await getAppSettings();
    const rule = explicit ? null : matchCategoryRule(settings.categoryRules, { vendor: d.vendor, description: d.notes });
    const fx = resolveFx({ amount: d.amount, currency: d.currency, fxRate: d.fxRate }, settings.currency);
    const exp = await Expense.create({
      kind: d.kind,
      vendor: d.vendor,
      vendorKey: vendorKey(d.vendor),
      category: explicit || rule?.category || inherited?.category || 'other',
      space: d.space.trim() || inherited?.space || '',
      taxDeductible: d.taxDeductible || inherited?.taxDeductible || false,
      taxCategory: d.taxCategory.trim() || inherited?.taxCategory || '',
      amount: fx.amount,
      currency: fx.currency,
      origAmount: fx.origAmount,
      fxRate: fx.fxRate,
      date,
      period: d.period || periodFrom(date),
      recurring: d.recurring || rule?.recurring || inherited?.recurring || false,
      recurringCycle: d.recurringCycle || rule?.recurringCycle || (inherited?.recurringCycle as typeof d.recurringCycle) || '',
      seriesId: (d.recurring || rule?.recurring || inherited?.recurring) ? (inherited?.seriesId || '') : '',
      paymentMethod: d.paymentMethod,
      notes: d.notes,
      split: cleanSplit(d.split),
      paymentSplits: splits,
      verified: true,
    });
    await syncGiftCardUses(String(exp._id), splits, date, d.vendor);
    revalidatePath('/expenses');
    revalidatePath('/income');
    return { ok: true, id: String(exp._id) };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
  });
}

/**
 * Settle up with one person (P35): mark every unsettled split entry with this name
 * (case-insensitive) as settled, across ALL expenses. Manual "they paid me back"
 * confirmation — deterministic, zero AI. Returns how many entries were settled.
 */
export async function settlePerson(name: string): Promise<{ ok: boolean; settled: number; error?: string }> {
  await assertCanWrite();
  const target = (name || '').trim().toLowerCase();
  if (!target) return { ok: false, settled: 0, error: 'No name' };
  return withRequestTenant(async () => {
    try {
      await connectDB();
      const Expense = await currentModel(ExpenseModel);
      const rows = await Expense.find({ 'split.name': { $exists: true } }).select('split').lean();
      type SplitRow = { name?: string; share?: number; settled?: boolean };
      const ops: Array<{ updateOne: { filter: { _id: unknown }; update: { $set: { split: SplitRow[] } } } }> = [];
      let settled = 0;
      for (const r of rows) {
        const split = (r.split as SplitRow[] | undefined) ?? [];
        let changed = false;
        const next: SplitRow[] = split.map((s) => {
          if (!s.settled && (s.name || '').trim().toLowerCase() === target) {
            changed = true;
            settled++;
            return { name: s.name, share: s.share, settled: true };
          }
          return s;
        });
        if (changed) ops.push({ updateOne: { filter: { _id: r._id }, update: { $set: { split: next } } } });
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (ops.length) await Expense.bulkWrite(ops as any);
      revalidatePath('/expenses');
      revalidatePath('/income');
      return { ok: true, settled };
    } catch (err) {
      return { ok: false, settled: 0, error: (err as Error).message };
    }
  });
}

export async function deleteExpense(id: string): Promise<{ ok: boolean }> {
  await assertCanWrite();
  return withRequestTenant(async () => {
  try {
    await connectDB();
    const Expense = await currentModel(ExpenseModel);
    // Soft delete → Trash (Settings → Storage & data). Files stay until purge.
    await Expense.updateOne({ _id: id }, { $set: { deletedAt: new Date() } });
    // #104: hand the gift-card money back. The mirrored `uses` rows were the only thing lowering
    // the card's balance, and a trashed expense no longer spent anything. Restore re-applies them.
    await syncGiftCardUses(id, [], new Date(), '');
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
  // Multi-currency (P9): the code PRINTED on the line; blank = the base currency.
  currency: z.string().max(8).default(''),
});

const MAX_CSV_ROWS_PER_CALL = 500;

export type CsvImportResult =
  | { ok: true; imported: number; skippedDupes: number; needsRate: number }
  | { ok: false; error: string };

/**
 * Import mapped CSV rows as expenses/income.
 * `signSplit`: negative amounts → expense, positive → income (typical bank export);
 * otherwise every row gets `kind` and the sign is dropped (amounts stored positive).
 * `fxRates` (P9): base units per 1 unit of a foreign code, e.g. `{USD: 0.92}` — one
 * rate per currency for the whole file, because a bank export prints a code per line
 * but never a rate. A foreign row whose code has no rate is still imported (with its
 * printed amount and code recorded, exactly like the AI-scan path) and counted in
 * `needsRate`, so the user can fix the rate per record instead of the import silently
 * adding a foreign number into a base-currency total.
 */
export async function importExpensesCsv(
  rows: Array<z.input<typeof CsvRowSchema>>,
  opts: { kind: Kind; signSplit: boolean; fxRates?: Record<string, number> }
): Promise<CsvImportResult> {
  await assertCanWrite();
  if (!Array.isArray(rows) || rows.length === 0) return { ok: false, error: 'No rows to import' };
  if (rows.length > MAX_CSV_ROWS_PER_CALL) return { ok: false, error: `Too many rows (max ${MAX_CSV_ROWS_PER_CALL} per batch)` };
  const parsed = z.array(CsvRowSchema).safeParse(rows);
  if (!parsed.success) return { ok: false, error: 'Invalid rows' };
  const kind = asKind(opts.kind);
  // Normalize the per-currency rate map once (callers may pass lowercase codes).
  const rates = new Map<string, number>();
  for (const [code, rate] of Object.entries(opts.fxRates ?? {})) {
    const c = normalizeCurrency(code);
    const n = Number(rate);
    if (c && Number.isFinite(n) && n > 0) rates.set(c, n);
  }

  return withRequestTenant(async () => {
    try {
      await connectDB();
      const Expense = await currentModel(ExpenseModel);
      const settings = await getAppSettings();

      const prepared = parsed.data.map((r) => {
        const rowKind: Kind = opts.signSplit ? (r.amount < 0 ? 'expense' : 'income') : kind;
        const vKey = vendorKey(r.vendor);
        // `printed` is what the file says; resolveFx decides what lands in `amount`.
        const printed = Math.abs(r.amount);
        const fx = resolveFx(
          { amount: printed, currency: r.currency, fxRate: rates.get(normalizeCurrency(r.currency)) ?? 0 },
          settings.currency
        );
        return { ...r, kind: rowKind, vKey, amount: printed, fx, key: csvDedupeKey(rowKind, vKey, r.date, printed) };
      });

      // Existing-record dedupe: one bounded query over the batch's date range.
      const dates = prepared.map((r) => new Date(`${r.date}T00:00:00Z`));
      const min = new Date(Math.min(...dates.map((d) => d.getTime())));
      const max = new Date(Math.max(...dates.map((d) => d.getTime())));
      max.setUTCDate(max.getUTCDate() + 1);
      const existing = await Expense.find({ date: { $gte: min, $lt: max } })
        .select('kind vendorKey date amount origAmount')
        .lean();
      const seen = new Set(
        existing.map((e) => {
          let dateIso = '';
          if (e.date) {
            try {
              dateIso = e.date instanceof Date ? e.date.toISOString() : new Date(e.date).toISOString();
            } catch {
              dateIso = '';
            }
          }
          return csvDedupeKey(
            e.kind === 'income' ? 'income' : 'expense',
            e.vendorKey || '',
            dateIso,
            // Compare printed against printed: a foreign record keeps its printed
            // figure in origAmount while `amount` holds the converted one.
            (e.origAmount || 0) > 0 ? e.origAmount : e.amount || 0
          );
        })
      );

      // Series inheritance (category/recurring) per vendor — one query per unique key.
      const inheritCache = new Map<string, Awaited<ReturnType<typeof inheritFromSeries>>>();
      async function inherited(rowKind: Kind, vKey: string, amount: number) {
        const k = `${rowKind}|${vKey}|${amount}`;
        if (!inheritCache.has(k)) inheritCache.set(k, await inheritFromSeries(rowKind, vKey, amount));
        return inheritCache.get(k) ?? null;
      }

      // Vendor→category auto-rules (P15) — loaded once, applied to rows without an
      // explicit CSV category (deterministic, zero AI, same as the rest of the import).
      const categoryRules = settings.categoryRules;

      const docs = [];
      let skippedDupes = 0;
      let needsRate = 0;
      for (const r of prepared) {
        if (seen.has(r.key)) { skippedDupes++; continue; }
        seen.add(r.key); // intra-batch dedupe too
        if (r.fx.needsRate) needsRate++;
        const inh = r.category ? null : await inherited(r.kind, r.vKey, r.amount);
        const rule = r.category ? null : matchCategoryRule(categoryRules, { vendor: r.vendor, description: r.notes });
        const date = new Date(`${r.date}T00:00:00Z`);
        docs.push({
          kind: r.kind,
          vendor: r.vendor,
          vendorKey: r.vKey,
          category: r.category || rule?.category || inh?.category || 'other',
          amount: r.fx.amount,
          currency: r.fx.currency,
          origAmount: r.fx.origAmount,
          fxRate: r.fx.fxRate,
          date,
          period: periodFrom(date),
          recurring: rule?.recurring || inh?.recurring || false,
          recurringCycle: (rule?.recurringCycle || inh?.recurringCycle || '') as RecurringCycle,
          seriesId: (rule?.recurring || inh?.recurring) ? (inh?.seriesId || '') : '',
          notes: r.notes,
          aiModel: 'csv-import',
          verified: true, // deterministic bank data, not an AI guess — no review queue
        });
      }

      if (docs.length) await Expense.insertMany(docs);
      revalidatePath('/expenses');
      revalidatePath('/income');
      return { ok: true, imported: docs.length, skippedDupes, needsRate };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  });
}

/** Re-run the AI on the stored file (text or forced OCR). Returns the updated record. */
export async function rescanExpense(id: string, useOcr: boolean): Promise<{ ok: boolean; expense?: SerializedExpense; error?: string }> {
  await assertCanWrite();
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
    exp.vendor = parsed.vendor || exp.vendor;
    exp.vendorKey = vendorKey(exp.vendor);
    exp.category = parsed.category || exp.category;
    // Re-parse may change both the amount and the printed currency; a rate the user had
    // already entered for this document stays valid, so it is fed back in (resolveFx drops
    // it by itself if the new currency turns out to be the base one).
    const fx = resolveFx(
      { amount: parsed.amount ?? exp.origAmount ?? exp.amount, currency: parsed.currency || exp.currency, fxRate: exp.fxRate },
      (await getAppSettings()).currency
    );
    exp.amount = fx.amount;
    exp.currency = fx.currency;
    exp.origAmount = fx.origAmount;
    exp.fxRate = fx.fxRate;
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

/**
 * Apply the vendor→category auto-rules (P15) to EXISTING uncategorised records
 * (category 'other' or empty). Forward rule-matching happens on create; this is the
 * one-off "apply to what I already have" the user triggers from Settings. Deterministic,
 * zero AI. Returns how many records were recategorised.
 */
export async function applyCategoryRulesToExisting(): Promise<{ ok: boolean; updated: number; error?: string }> {
  await assertCanWrite();
  return withRequestTenant(async () => {
    try {
      await connectDB();
      const rules = (await getAppSettings()).categoryRules;
      if (!rules.length) return { ok: true, updated: 0 };
      const Expense = await currentModel(ExpenseModel);
      const rows = await Expense.find({ $or: [{ category: 'other' }, { category: '' }, { category: { $exists: false } }] })
        .select('vendor notes category recurring recurringCycle')
        .lean();
      const ops: Array<{ updateOne: { filter: { _id: unknown }; update: { $set: Record<string, unknown> } } }> = [];
      for (const r of rows) {
        const rule = matchCategoryRule(rules, { vendor: r.vendor, description: r.notes });
        if (!rule || rule.category === r.category) continue;
        const set: Record<string, unknown> = { category: rule.category };
        if (rule.recurring && !r.recurring) {
          set.recurring = true;
          if (rule.recurringCycle) set.recurringCycle = rule.recurringCycle;
        }
        ops.push({ updateOne: { filter: { _id: r._id }, update: { $set: set } } });
      }
      if (ops.length) await Expense.bulkWrite(ops);
      revalidatePath('/expenses');
      revalidatePath('/income');
      revalidatePath('/reports');
      return { ok: true, updated: ops.length };
    } catch (err) {
      return { ok: false, updated: 0, error: (err as Error).message };
    }
  });
}

// ── Duplicate detection & merge (P46) ────────────────────────────────────────
// Mirrors the review-before-merge flow Receipts/Stores/Items already have. The
// grouping rule itself lives in lib/expenseDupes.ts (pure, tested); these two
// exports are only the database halves of it.

/** Candidate duplicates for one tab (expenses or income), most valuable cluster first. */
export async function findDuplicateExpenses(kind: Kind): Promise<ExpenseDupeGroup[]> {
  return withRequestTenant(async () => {
    await connectDB();
    const Expense = await currentModel(ExpenseModel);
    // amount > 0 is enforced in the query AND in expenseDupeKey: empty drafts (an AI
    // parse that came back with nothing) would otherwise be the biggest "duplicate"
    // cluster in the library and every one of them a false positive.
    const rows = await Expense.find({ kind: asKind(kind), amount: { $gt: 0 } })
      .select(
        'kind vendor vendorKey category amount currency date verified recurring filePath notes paymentMethod space taxCategory split aiModel'
      )
      .lean();

    return groupExpenseDupes(
      (rows as unknown as Array<Record<string, unknown>>).map((r) => ({
        _id: String(r._id),
        kind: asKind(r.kind),
        vendor: String(r.vendor ?? ''),
        vendorKey: String(r.vendorKey ?? ''),
        category: String(r.category ?? ''),
        amount: Number(r.amount) || 0,
        currency: String(r.currency ?? ''),
        date: r.date ? new Date(r.date as string).toISOString() : '',
        verified: !!r.verified,
        recurring: !!r.recurring,
        hasFile: !!r.filePath,
        notes: String(r.notes ?? ''),
        paymentMethod: String(r.paymentMethod ?? ''),
        space: String(r.space ?? ''),
        taxCategory: String(r.taxCategory ?? ''),
        splitCount: Array.isArray(r.split) ? r.split.length : 0,
        aiModel: String(r.aiModel ?? ''),
      }))
    );
  });
}

/**
 * Merge duplicates into one survivor: backfill every field the survivor is missing from
 * the dropped records, then soft-delete the drops.
 *
 * Two things this does that the Receipts version does not, both because Expenses are
 * soft-deleted (Trash) while receipts are not:
 *  - the drops go to the Trash, so a merge the user regrets is undoable for 30 days;
 *  - when the survivor adopts a dropped record's FILE, that record's file reference is
 *    cleared first. `purgeTrashEntry` deletes an expense's filePath/thumbPath
 *    unconditionally, so leaving the reference on the trashed copy would mean the
 *    30-day auto-purge silently deleting the surviving record's document.
 */
export async function mergeExpenses(
  keepId: string,
  dropIds: string[]
): Promise<{ ok: boolean; merged: number; error?: string }> {
  await assertCanWrite();
  return withRequestTenant(async () => {
    try {
      await connectDB();
      const Expense = await currentModel(ExpenseModel);
      const keep = await Expense.findById(keepId);
      if (!keep) return { ok: false, merged: 0, error: 'Record to keep not found' };

      const targets = dropIds.filter((id) => id && id !== keepId);
      if (targets.length === 0) return { ok: false, merged: 0, error: 'No records to merge' };
      // Same `kind` only: an income can never be merged into an expense, whatever the
      // client sent. Already-trashed records are excluded by the soft-delete plugin.
      const drops = await Expense.find({ _id: { $in: targets }, kind: keep.kind });
      if (drops.length === 0) return { ok: false, merged: 0, error: 'No records to merge' };

      const fileAdopted: string[] = [];
      for (const d of drops) {
        if (!keep.vendor && d.vendor) {
          keep.vendor = d.vendor;
          keep.vendorKey = d.vendorKey;
        }
        if ((!keep.category || keep.category === 'other') && d.category && d.category !== 'other') {
          keep.category = d.category;
        }
        if (!keep.period && d.period) keep.period = d.period;
        if (!keep.paymentMethod && d.paymentMethod) keep.paymentMethod = d.paymentMethod;
        if (!keep.notes && d.notes) keep.notes = d.notes;
        if (!keep.space && d.space) keep.space = d.space;
        if (!keep.taxCategory && d.taxCategory) keep.taxCategory = d.taxCategory;
        if (!keep.taxDeductible && d.taxDeductible) keep.taxDeductible = true;
        if (!keep.recurring && d.recurring) {
          keep.recurring = true;
          if (d.recurringCycle) keep.recurringCycle = d.recurringCycle;
        }
        if ((!keep.split || keep.split.length === 0) && d.split?.length) {
          keep.split = d.split;
          keep.markModified('split');
        }
        // #168: how the purchase was PAID is part of the record too. Without this the survivor of a
        // merge loses the payment split, and with it the link to the gift card the money came from.
        if ((!keep.paymentSplits || keep.paymentSplits.length === 0) && d.paymentSplits?.length) {
          keep.paymentSplits = d.paymentSplits;
          keep.markModified('paymentSplits');
        }
        // Foreign-currency provenance (P9): amount is already base currency and equal
        // across the group, but only one copy may carry what was printed on the document.
        if (!keep.fxRate && d.fxRate) {
          keep.currency = d.currency;
          keep.origAmount = d.origAmount;
          keep.fxRate = d.fxRate;
        }
        if (!keep.filePath && d.filePath) {
          keep.filePath = d.filePath;
          keep.fileType = d.fileType;
          keep.thumbPath = d.thumbPath;
          keep.fileSize = d.fileSize;
          if (!keep.aiModel && d.aiModel) {
            keep.aiModel = d.aiModel;
            keep.aiParsedAt = d.aiParsedAt;
          }
          fileAdopted.push(String(d._id));
        }
        if (!keep.verified && d.verified) keep.verified = true;
      }
      await keep.save();

      const now = new Date();
      for (const d of drops) {
        // #168: a trashed copy no longer spends anything. Release its mirrored gift-card uses
        // exactly as deleteExpense does — otherwise merging two copies of one purchase leaves the
        // card charged twice, and the second charge belongs to a record nobody can see any more.
        await syncGiftCardUses(String(d._id), [], now, '');
        const set: Record<string, unknown> = { deletedAt: now };
        // See the doc comment: the survivor now owns this file, so the trashed copy must
        // stop pointing at it before purge gets the chance to delete it.
        if (fileAdopted.includes(String(d._id))) {
          set.filePath = '';
          set.thumbPath = '';
          set.fileType = '';
          set.fileSize = 0;
        }
        await Expense.updateOne({ _id: d._id }, { $set: set });
      }
      // …and the survivor re-states its own spend, so the card ends up charged exactly once, under
      // the record that still exists (the split may have just been adopted from a dropped copy).
      await syncGiftCardUses(
        String(keep._id),
        cleanPaymentSplits(keep.paymentSplits ?? []),
        keep.date ? new Date(keep.date) : now,
        keep.vendor || ''
      );

      revalidatePath('/expenses');
      revalidatePath('/income');
      revalidatePath('/reports');
      return { ok: true, merged: drops.length };
    } catch (err) {
      return { ok: false, merged: 0, error: (err as Error).message };
    }
  });
}

export type BulkExpensePatch = { category?: string };

/**
 * Bulk field-edit (P78): apply a category change to every selected expense/income record in
 * ONE `updateMany`, instead of opening the detail modal N times for the same edit (e.g. a batch
 * of bills imported with the wrong category). Category-only, NOT category+tags like the Items
 * equivalent (`bulkUpdateItems`): the P78 spec called for both, but `Expense` (models/Expense.ts)
 * has no `tags` field at all — adding one would be a schema change beyond an "S" bulk-edit item,
 * so this ships the field that already exists rather than growing scope silently. Anything
 * individually-required (vendor, amount) stays a 1-to-1 edit, same reasoning as Items. Filtered
 * by `kind` too, same defensive habit as `mergeExpenses`: a bulk edit issued from the Income tab
 * can never touch an expense row (or vice versa), whatever ids the client sent.
 */
export async function bulkUpdateExpenses(
  ids: string[],
  patch: BulkExpensePatch,
  kind: Kind
): Promise<{ ok: boolean; updated: number; error?: string }> {
  await assertCanWrite();
  return withRequestTenant(async () => {
    try {
      const targets = [...new Set(ids)].filter(Boolean);
      if (targets.length === 0) return { ok: false, updated: 0, error: 'No records selected' };

      const category = patch.category?.trim();
      if (!category) return { ok: false, updated: 0, error: 'Nothing to update' };

      await connectDB();
      const Expense = await currentModel(ExpenseModel);
      const res = await Expense.updateMany({ _id: { $in: targets }, kind: asKind(kind) }, { $set: { category } });
      revalidatePath('/expenses');
      revalidatePath('/income');
      return { ok: true, updated: res.modifiedCount ?? targets.length };
    } catch (err) {
      return { ok: false, updated: 0, error: (err as Error).message };
    }
  });
}
