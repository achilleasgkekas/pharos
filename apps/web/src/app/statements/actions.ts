'use server';
import { connectDB } from '@/lib/db';
import { Statement } from '@/models/Statement';
import { Card } from '@/models/Card';
import { saveFile, deleteFile, readFile } from '@/lib/storage';
import { extractPdfText, looksLikeScannedPdf } from '@/lib/pdf';
import { ocrPdf } from '@/lib/ocr';
import { parseStatementText, categorizeTransactions } from '@/lib/ollama';
import { safeDate, safeDateOrNull } from '@/lib/dates';
import { normalizeLast4, detectCardType, buildCardLabel } from '@/lib/cards';
import { mirrorFileToRemote } from '@/lib/mirror';
import { installmentSignature } from '@/lib/installments';
import type { SerializedTransaction, SerializedStatement } from '@/types';
import { revalidatePath } from 'next/cache';
import { Types } from 'mongoose';
import { z } from 'zod';

/** Stable installment signature for a freshly-parsed or stored transaction. */
function sigOf(
  t: {
    description: string;
    installmentInfo?: { currentInstallment?: number | null; totalInstallments?: number | null; originalPurchase?: string | null } | null;
  },
  period: string
): string {
  if (!t.installmentInfo) return '';
  const sig = installmentSignature(t as unknown as SerializedTransaction, period);
  return sig.startsWith('|') ? '' : sig;
}

type PriorTxLite = {
  description: string;
  installmentInfo?: { currentInstallment?: number; totalInstallments?: number; originalPurchase?: string } | null;
  matchedItemIds?: unknown[];
};

/**
 * Manually set (or clear) the installment counter on a transaction — for lines
 * where the statement didn't print "x/y". Setting it lets the same plan be
 * recognised and continued by future statements; we also inherit a product link
 * right away if this plan is already linked in another statement.
 */
export async function setTransactionInstallment(
  statementId: string,
  txId: string,
  current: number,
  total: number
): Promise<{ ok: boolean; error?: string }> {
  await connectDB();
  const stmt = await Statement.findById(statementId);
  if (!stmt) return { ok: false, error: 'Statement not found' };
  const tx = stmt.transactions.id(txId);
  if (!tx) return { ok: false, error: 'Transaction not found' };

  if (total > 0) {
    tx.installmentInfo = {
      currentInstallment: current > 0 ? current : 1,
      totalInstallments: total,
      originalPurchase: tx.description,
    };
    // No cross-statement scan here (it made editing hang on big imports). The
    // signature-based grouping in computeInstallmentPlans already merges this
    // line into the matching plan and inherits its product link for display.
  } else {
    tx.installmentInfo = null;
  }

  stmt.markModified('transactions');
  await stmt.save();
  revalidatePath('/statements');
  revalidatePath('/items');
  return { ok: true };
}

/**
 * Bind every charge of one installment plan into another, even when their printed
 * descriptions differ ("QUEST ONLINE" vs "QUEST ONLINE KALLITHEA"). We stamp the
 * source charges with the target plan's grouping key (planKey), so the payoff math
 * collapses both into one plan from now on (and future statements follow).
 */
export async function bindInstallmentGroup(
  sourceKey: string,
  targetKey: string
): Promise<{ ok: boolean; moved?: number; error?: string }> {
  if (!sourceKey || !targetKey || sourceKey === targetKey) {
    return { ok: false, error: 'Pick two different plans' };
  }
  await connectDB();
  const statements = await Statement.find();
  let moved = 0;
  for (const s of statements) {
    let changed = false;
    for (const tx of s.transactions) {
      if (!tx.installmentInfo) continue;
      const gk = tx.installmentInfo.planKey || sigOf(tx as unknown as SerializedTransaction, s.period);
      if (gk && gk === sourceKey) {
        tx.installmentInfo.planKey = targetKey;
        changed = true;
        moved++;
      }
    }
    if (changed) {
      s.markModified('transactions');
      await s.save();
    }
  }
  revalidatePath('/statements');
  revalidatePath('/items');
  return { ok: true, moved };
}

/** Undo a merge: clear the manual planKey on every charge bound to `boundKey`, so
 *  they revert to their own auto signatures (splitting back into separate plans). */
export async function unbindInstallmentGroup(
  boundKey: string
): Promise<{ ok: boolean; moved?: number }> {
  await connectDB();
  const statements = await Statement.find();
  let moved = 0;
  for (const s of statements) {
    let changed = false;
    for (const tx of s.transactions) {
      if (tx.installmentInfo?.planKey && tx.installmentInfo.planKey === boundKey) {
        tx.installmentInfo.planKey = null;
        changed = true;
        moved++;
      }
    }
    if (changed) {
      s.markModified('transactions');
      await s.save();
    }
  }
  revalidatePath('/statements');
  revalidatePath('/items');
  return { ok: true, moved };
}

/**
 * Find a managed card by last4 (or create one if missing). Returns the stable
 * display label + id so a statement can be filtered per physical card.
 * "φτιάξε νέα κάρτα αν σκανάρει στατεμεντ αλλά αν την ξαναβρεί απλά ματσάρισέ την"
 */
async function findOrCreateCard(
  rawName: string,
  rawLast4: string
): Promise<{ label: string; cardId: string | null; last4: string }> {
  const last4 = normalizeLast4(rawLast4);
  const name = (rawName || '').trim();

  // Match an existing card by last4 first (most reliable), else by exact name.
  let card = null;
  if (last4) card = await Card.findOne({ last4 });
  if (!card && name) card = await Card.findOne({ name });

  if (!card) {
    if (!last4 && !name) return { label: 'Unknown card', cardId: null, last4: '' };
    card = await Card.create({
      name: name || 'Card',
      last4,
      type: detectCardType(name),
      kind: 'credit',
    });
  }

  return {
    label: buildCardLabel(card.name, card.last4),
    cardId: String(card._id),
    last4: card.last4 || last4,
  };
}

const StatementFormSchema = z.object({
  card: z.string().min(1, 'Card required'),
  period: z.string().regex(/^\d{4}-\d{2}$/, 'Format: YYYY-MM'),
  statementDate: z.string(),
  dueDate: z.string().optional().default(''),
  totalAmount: z.coerce.number(),
  minimumPayment: z.coerce.number().default(0),
  paidAmount: z.coerce.number().default(0),
  notes: z.string().default(''),
});

const TransactionSchema = z.object({
  date: z.string(),
  description: z.string().min(1),
  amount: z.coerce.number(),
  category: z.string().default('uncategorized'),
  currentInstallment: z.coerce.number().optional(),
  totalInstallments: z.coerce.number().optional(),
});

export async function createStatement(formData: FormData) {
  const raw = StatementFormSchema.parse(Object.fromEntries(formData));
  await connectDB();
  await Statement.create({
    card: raw.card,
    period: raw.period,
    statementDate: safeDate(raw.statementDate),
    dueDate: safeDateOrNull(raw.dueDate) ?? undefined,
    totalAmount: raw.totalAmount,
    minimumPayment: raw.minimumPayment,
    paidAmount: raw.paidAmount,
    notes: raw.notes,
  });
  revalidatePath('/statements');
}

export async function updateStatement(id: string, formData: FormData) {
  const raw = StatementFormSchema.parse(Object.fromEntries(formData));
  await connectDB();
  await Statement.findByIdAndUpdate(id, {
    card: raw.card,
    period: raw.period,
    statementDate: safeDate(raw.statementDate),
    dueDate: safeDateOrNull(raw.dueDate),
    totalAmount: raw.totalAmount,
    minimumPayment: raw.minimumPayment,
    paidAmount: raw.paidAmount,
    notes: raw.notes,
  });
  revalidatePath('/statements');
}

export async function deleteStatement(id: string) {
  await connectDB();
  const stmt = await Statement.findById(id);
  if (stmt?.filePath) {
    try {
      await deleteFile(stmt.filePath);
    } catch {
      /* file gone */
    }
  }
  await Statement.findByIdAndDelete(id);
  revalidatePath('/statements');
}

export async function addTransaction(statementId: string, formData: FormData) {
  const raw = TransactionSchema.parse(Object.fromEntries(formData));
  const installmentInfo =
    raw.currentInstallment && raw.totalInstallments
      ? {
          currentInstallment: raw.currentInstallment,
          totalInstallments: raw.totalInstallments,
          originalPurchase: raw.description,
        }
      : null;

  await connectDB();
  await Statement.findByIdAndUpdate(statementId, {
    $push: {
      transactions: {
        date: safeDate(raw.date),
        description: raw.description,
        amount: raw.amount,
        category: raw.category,
        installmentInfo,
      },
    },
  });
  revalidatePath('/statements');
}

export async function deleteTransaction(statementId: string, transactionId: string) {
  await connectDB();
  await Statement.findByIdAndUpdate(statementId, {
    $pull: { transactions: { _id: transactionId } },
  });
  revalidatePath('/statements');
}

/** AI auto-categorize all transactions of a statement (groceries, electronics, ...). */
export async function categorizeStatement(statementId: string): Promise<{ ok: boolean; error?: string }> {
  await connectDB();
  const stmt = await Statement.findById(statementId);
  if (!stmt) return { ok: false, error: 'Not found' };

  const descriptions = stmt.transactions.map((t) => t.description);
  if (descriptions.length === 0) return { ok: true };

  let categories: string[];
  try {
    categories = await categorizeTransactions(descriptions);
  } catch (err) {
    return { ok: false, error: `AI failed: ${(err as Error).message.slice(0, 100)}` };
  }
  if (categories.length !== descriptions.length) {
    return { ok: false, error: 'The AI returned the wrong number of categories' };
  }

  stmt.transactions.forEach((t, i) => {
    if (categories[i]) t.category = categories[i];
  });
  await stmt.save();
  revalidatePath('/statements');
  return { ok: true };
}

function revalidateInstallments() {
  revalidatePath('/statements');
  revalidatePath('/items');
  revalidatePath('/reports');
  revalidatePath('/');
}

/**
 * Link an installment charge to a product, and auto-propagate that link to every
 * similar installment line across all statements (same purchase, paid monthly).
 * "συσχετίζονται και στατεμεντ με στατεμεντ — τσεκάρει για ομοιότητες σε χρεώσεις
 *  ώστε να τις περνάει αυτόματα στο προιόν".
 */
export async function linkInstallmentToItem(
  statementId: string,
  transactionId: string,
  itemId: string
): Promise<{ ok: boolean; linked: number; error?: string }> {
  await connectDB();
  const src = await Statement.findById(statementId);
  const tx = src?.transactions.id(transactionId);
  if (!src || !tx) return { ok: false, linked: 0, error: 'Transaction not found' };

  const targetSig = installmentSignature(tx as unknown as SerializedTransaction, src.period);
  const linked = await addItemBySignature(targetSig, itemId);
  revalidateInstallments();
  return { ok: true, linked };
}

/**
 * Add a product to an entire installment plan (identified by its signature).
 * A single plan can carry MULTIPLE products (one card charge, many items bought
 * together on one receipt) — this is additive, not a replace.
 */
export async function linkPlanToItem(
  signature: string,
  itemId: string
): Promise<{ ok: boolean; linked: number }> {
  await connectDB();
  const linked = await addItemBySignature(signature, itemId);
  revalidateInstallments();
  return { ok: true, linked };
}

/** Remove ONE product from an installment plan (by signature), keeping the rest. */
export async function removeItemFromPlanByKey(
  signature: string,
  itemId: string
): Promise<{ ok: boolean }> {
  await connectDB();
  await removeItemBySignature(signature, itemId);
  revalidateInstallments();
  return { ok: true };
}

/** Remove ALL product links from an installment plan (all its lines). */
export async function unlinkInstallment(
  statementId: string,
  transactionId: string
): Promise<{ ok: boolean }> {
  await connectDB();
  const src = await Statement.findById(statementId);
  const tx = src?.transactions.id(transactionId);
  if (!src || !tx) return { ok: false };

  const targetSig = installmentSignature(tx as unknown as SerializedTransaction, src.period);
  await clearLinkBySignature(targetSig);
  revalidateInstallments();
  return { ok: true };
}

/** Clear ALL product links from an installment plan by its signature. */
export async function unlinkPlanByKey(signature: string): Promise<{ ok: boolean }> {
  await connectDB();
  await clearLinkBySignature(signature);
  revalidateInstallments();
  return { ok: true };
}

// ─── Internal signature-based mutators (matchedItemIds is an array) ──────────

/** Add itemId to matchedItemIds on every line whose signature matches. */
async function addItemBySignature(sig: string, itemId: string): Promise<number> {
  if (!sig || !itemId) return 0;
  const all = await Statement.find();
  let linked = 0;
  for (const s of all) {
    let changed = false;
    for (const t of s.transactions) {
      if (!t.installmentInfo) continue;
      if (installmentSignature(t as unknown as SerializedTransaction, s.period) !== sig) continue;
      const ids = (t.matchedItemIds ?? []).map((x) => String(x));
      if (!ids.includes(itemId)) {
        t.matchedItemIds.push(new Types.ObjectId(itemId) as unknown as (typeof t.matchedItemIds)[number]);
        changed = true;
        linked++;
      }
    }
    if (changed) await s.save();
  }
  return linked;
}

/** Pull itemId out of matchedItemIds on every line whose signature matches. */
async function removeItemBySignature(sig: string, itemId: string): Promise<void> {
  if (!sig || !itemId) return;
  const all = await Statement.find();
  for (const s of all) {
    let changed = false;
    for (const t of s.transactions) {
      if (!t.installmentInfo || !(t.matchedItemIds?.length)) continue;
      if (installmentSignature(t as unknown as SerializedTransaction, s.period) !== sig) continue;
      const before = t.matchedItemIds.length;
      t.matchedItemIds = t.matchedItemIds.filter((x) => String(x) !== itemId) as typeof t.matchedItemIds;
      if (t.matchedItemIds.length !== before) changed = true;
    }
    if (changed) await s.save();
  }
}

/** Clear matchedItemIds on every line whose signature matches. */
async function clearLinkBySignature(sig: string): Promise<void> {
  if (!sig) return;
  const all = await Statement.find();
  for (const s of all) {
    let changed = false;
    for (const t of s.transactions) {
      if (!t.installmentInfo || !(t.matchedItemIds?.length)) continue;
      if (installmentSignature(t as unknown as SerializedTransaction, s.period) === sig) {
        t.matchedItemIds = [] as unknown as typeof t.matchedItemIds;
        changed = true;
      }
    }
    if (changed) await s.save();
  }
}

export async function attachStatementPdf(statementId: string, formData: FormData) {
  const file = formData.get('file');
  if (!file || !(file instanceof File) || file.size === 0) {
    return { ok: false, error: 'No file found' };
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  const ext = file.name.split('.').pop()?.toLowerCase() || 'pdf';
  const { relativePath } = await saveFile('statements', bytes, ext);
  await connectDB();
  await Statement.findByIdAndUpdate(statementId, { filePath: relativePath });
  revalidatePath('/statements');
  return { ok: true };
}

export type ImportResult =
  | {
      ok: true;
      id: string;
      aiUsed: boolean;
      txCount: number;
      inherited?: number;
      aiError?: string;
      period?: string;
      // true when this import overwrote a DIFFERENT statement already sitting in
      // {card, period} — usually means the statement date was misread (e.g. an
      // April statement parsed as March). Surfaced so the user can catch it.
      replacedExisting?: boolean;
    }
  | { ok: false; error: string };

/**
 * Import a credit-card statement PDF: store it, extract text, parse with AI
 * into structured transactions (incl. δόσεις), and upsert by card+period.
 */
export async function importStatementPdf(formData: FormData): Promise<ImportResult> {
  const file = formData.get('file');
  if (!file || !(file instanceof File) || file.size === 0) {
    return { ok: false, error: 'No file found' };
  }
  if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
    return { ok: false, error: 'A PDF file is required' };
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  let relativePath: string;
  try {
    relativePath = (await saveFile('statements', bytes, 'pdf')).relativePath;
  } catch (err) {
    return { ok: false, error: `Failed to save: ${(err as Error).message}` };
  }

  // Extract text
  let text = '';
  try {
    text = await extractPdfText(bytes);
  } catch (err) {
    return { ok: false, error: `Failed to read PDF: ${(err as Error).message}` };
  }

  const fallbackPeriod = new Date().toISOString().slice(0, 7);
  if (looksLikeScannedPdf(text)) {
    // Scanned/image PDF — store it as an empty draft for manual entry
    await connectDB();
    const stmt = await Statement.create({
      card: 'Unknown card', period: fallbackPeriod, statementDate: new Date(),
      totalAmount: 0, filePath: relativePath,
      notes: 'Scanned PDF — no text found, enter manually.',
    });
    revalidatePath('/statements');
    return { ok: true, id: String(stmt._id), aiUsed: false, txCount: 0, aiError: 'Scanned PDF with no text' };
  }

  // AI parse
  let parsed: Awaited<ReturnType<typeof parseStatementText>>['parsed'] | null = null;
  let aiError: string | undefined;
  try {
    parsed = (await parseStatementText(text)).parsed;
  } catch (err) {
    const msg = (err as Error).message || String(err);
    aiError = /ECONNREFUSED|fetch failed|ENOTFOUND/i.test(msg)
      ? 'Ollama is not reachable'
      : `AI parse failed: ${msg.slice(0, 120)}`;
  }

  // Period from the statement's OWN issue date (deterministic) — stops the model
  // drifting one month onto the previous statement's date. Falls back to the
  // parsed period, then the current month.
  const sd = safeDateOrNull(parsed?.statementDate);
  const period =
    sd && !Number.isNaN(sd.getTime())
      ? `${sd.getUTCFullYear()}-${String(sd.getUTCMonth() + 1).padStart(2, '0')}`
      : parsed?.period?.match(/^\d{4}-\d{2}$/)
        ? parsed.period
        : fallbackPeriod;
  const transactions = (parsed?.transactions ?? []).map((t) => ({
    date: safeDate(t.date),
    description: t.description,
    amount: t.amount,
    category: 'uncategorized',
    installmentInfo:
      t.currentInstallment && t.totalInstallments
        ? {
            currentInstallment: t.currentInstallment,
            totalInstallments: t.totalInstallments,
            originalPurchase: t.description,
          }
        : null,
    matchedItemIds: [] as Types.ObjectId[],
  }));

  try {
    await connectDB();

    // E2: carry product links forward. If an installment of this same purchase was
    // already matched to a product in an earlier statement, inherit that match so
    // this month's line joins the existing plan and the product payoff advances.
    type PriorTx = {
      description: string;
      installmentInfo?: { currentInstallment?: number; totalInstallments?: number; originalPurchase?: string } | null;
      matchedItemIds?: unknown[];
    };
    const prior = await Statement.find({}, { period: 1, transactions: 1 }).lean();
    const linkBySig = new Map<string, Set<string>>(); // sig → all linked product ids
    for (const st of prior) {
      for (const t of (st.transactions ?? []) as PriorTx[]) {
        if (!t.installmentInfo || !(t.matchedItemIds?.length)) continue;
        const sig = sigOf(t, st.period as string);
        if (!sig) continue;
        const set = linkBySig.get(sig) ?? new Set<string>();
        for (const id of t.matchedItemIds) set.add(String(id));
        linkBySig.set(sig, set);
      }
    }
    let inherited = 0;
    for (const t of transactions) {
      if (!t.installmentInfo) continue;
      const ids = linkBySig.get(sigOf(t, period));
      if (ids && ids.size) {
        t.matchedItemIds = [...ids].map((id) => new Types.ObjectId(id));
        inherited++;
      }
    }

    // Match/create the physical card so statements can be filtered per card.
    const { label: card, cardId, last4 } = await findOrCreateCard(
      parsed?.card || '',
      parsed?.last4 || ''
    );
    // Collision guard: is a DIFFERENT statement already occupying {card, period}?
    // A misread date (e.g. an April statement parsed as March) drops it onto the
    // wrong month and the upsert would silently overwrite that month. Flag it so
    // the UI can warn the user instead of losing a statement quietly.
    const existing = await Statement.findOne({ card, period }, { filePath: 1 }).lean();
    const replacedExisting = !!(existing && existing.filePath && existing.filePath !== relativePath);
    // Upsert by card + period (matches the unique index)
    const stmt = await Statement.findOneAndUpdate(
      { card, period },
      {
        card,
        last4,
        cardId,
        period,
        statementDate: safeDate(parsed?.statementDate),
        dueDate: safeDateOrNull(parsed?.dueDate) ?? undefined,
        totalAmount: parsed?.totalAmount ?? 0,
        minimumPayment: parsed?.minimumPayment ?? 0,
        transactions,
        filePath: relativePath,
      },
      { upsert: true, new: true }
    );
    // Auto-mirror the PDF to the remote backend when enabled — fire-and-forget.
    void mirrorFileToRemote({ kind: 'statements', store: card, date: stmt!.statementDate, total: parsed?.totalAmount ?? 0, id: stmt!._id }, relativePath);
    revalidatePath('/statements');
    revalidatePath('/items');
    revalidatePath('/shopping');
    return {
      ok: true,
      id: String(stmt!._id),
      aiUsed: parsed !== null,
      txCount: transactions.length,
      inherited,
      aiError,
      period,
      replacedExisting,
    };
  } catch (err) {
    return { ok: false, error: `DB error: ${(err as Error).message}` };
  }
}

export type StatementRescanResult = {
  ok: boolean;
  aiUsed: boolean;
  txCount?: number;
  installmentsFound?: number;
  preservedLinks?: number;
  usedOcr?: boolean;
  aiError?: string;
  error?: string;
  statement?: SerializedStatement; // updated doc so the open detail re-syncs in place
};

/**
 * Re-run the AI parse on a statement's stored PDF and refresh its transactions.
 * `useOcr` rasterizes every page and OCRs it (Greek+English) before the text model
 * — the fix for statements where the embedded text layer dropped the "ΔΟΣΗ x/y"
 * installment column, so installments were never detected. Existing product links
 * AND manual installment edits are PRESERVED (keyed by description+amount), and
 * cross-statement links are re-inherited by signature. Card/period/file are kept,
 * so a re-scan never moves the statement to another month.
 */
export async function rescanStatement(id: string, useOcr: boolean): Promise<StatementRescanResult> {
  await connectDB();
  const stmt = await Statement.findById(id);
  if (!stmt?.filePath) return { ok: false, aiUsed: false, error: 'Statement or file not found' };

  let bytes: Buffer;
  try {
    bytes = await readFile(stmt.filePath);
  } catch {
    return { ok: false, aiUsed: false, error: 'File missing from storage' };
  }

  // Get text. OCR path rasterizes + OCRs every page; otherwise embedded text with
  // an automatic OCR fallback when the PDF has no usable text layer.
  let text = '';
  let usedOcr = useOcr;
  try {
    if (useOcr) {
      text = await ocrPdf(bytes);
    } else {
      text = await extractPdfText(bytes);
      if (looksLikeScannedPdf(text)) {
        text = await ocrPdf(bytes);
        usedOcr = true;
      }
    }
  } catch (err) {
    return { ok: false, aiUsed: false, error: `Failed to read PDF: ${(err as Error).message}` };
  }

  let parsed: Awaited<ReturnType<typeof parseStatementText>>['parsed'] | null = null;
  let aiError: string | undefined;
  try {
    parsed = (await parseStatementText(text)).parsed;
  } catch (err) {
    const msg = (err as Error).message || String(err);
    aiError = /ECONNREFUSED|fetch failed|ENOTFOUND/i.test(msg)
      ? 'Ollama is not reachable'
      : `AI parse failed: ${msg.slice(0, 120)}`;
  }
  if (!parsed) return { ok: false, aiUsed: false, usedOcr, aiError, error: aiError ?? 'No AI result' };

  // Preserve the user's work: capture existing installment edits + product links,
  // keyed by a stable description+amount key, before overwriting transactions.
  const keyOf = (desc: string, amount: number) =>
    `${(desc || '').trim().toUpperCase().slice(0, 40)}|${(amount || 0).toFixed(2)}`;
  type Preserved = {
    installmentInfo: { currentInstallment?: number; totalInstallments?: number; originalPurchase?: string } | null;
    matchedItemIds: string[];
  };
  const oldByKey = new Map<string, Preserved>();
  for (const t of stmt.transactions ?? []) {
    oldByKey.set(keyOf(t.description, t.amount), {
      installmentInfo: t.installmentInfo
        ? {
            currentInstallment: t.installmentInfo.currentInstallment ?? undefined,
            totalInstallments: t.installmentInfo.totalInstallments ?? undefined,
            originalPurchase: t.installmentInfo.originalPurchase ?? undefined,
          }
        : null,
      matchedItemIds: (t.matchedItemIds ?? []).map((x) => String(x)),
    });
  }

  const newTx = (parsed.transactions ?? []).map((t) => {
    const old = oldByKey.get(keyOf(t.description, t.amount));
    // A freshly-detected installment wins; otherwise keep a manual one from before.
    const detected =
      t.currentInstallment && t.totalInstallments
        ? {
            currentInstallment: t.currentInstallment,
            totalInstallments: t.totalInstallments,
            originalPurchase: t.description,
          }
        : null;
    return {
      date: safeDate(t.date),
      description: t.description,
      amount: t.amount,
      category: 'uncategorized',
      installmentInfo: detected ?? old?.installmentInfo ?? null,
      matchedItemIds: (old?.matchedItemIds ?? []).map((sid) => new Types.ObjectId(sid)),
    };
  });

  // Cross-check: re-inherit product links by signature from the OTHER statements.
  type PriorTx = {
    description: string;
    installmentInfo?: { currentInstallment?: number; totalInstallments?: number; originalPurchase?: string } | null;
    matchedItemIds?: unknown[];
  };
  const period = stmt.period as string;
  const prior = await Statement.find({ _id: { $ne: stmt._id } }, { period: 1, transactions: 1 }).lean();
  const linkBySig = new Map<string, Set<string>>();
  for (const st of prior) {
    for (const t of (st.transactions ?? []) as PriorTx[]) {
      if (!t.installmentInfo || !t.matchedItemIds?.length) continue;
      const sig = sigOf(t, st.period as string);
      if (!sig) continue;
      const set = linkBySig.get(sig) ?? new Set<string>();
      for (const idv of t.matchedItemIds) set.add(String(idv));
      linkBySig.set(sig, set);
    }
  }
  let installmentsFound = 0;
  let preservedLinks = 0;
  for (const t of newTx) {
    if (t.installmentInfo) {
      installmentsFound++;
      const ids = linkBySig.get(sigOf(t, period));
      if (ids?.size) {
        const merged = new Set(t.matchedItemIds.map((x) => String(x)));
        for (const idv of ids) merged.add(idv);
        t.matchedItemIds = [...merged].map((sid) => new Types.ObjectId(sid));
      }
    }
    if (t.matchedItemIds.length) preservedLinks++;
  }

  // Refresh transactions + totals; keep card/period/file untouched.
  stmt.transactions = newTx as unknown as typeof stmt.transactions;
  if (typeof parsed.totalAmount === 'number') stmt.totalAmount = parsed.totalAmount;
  if (typeof parsed.minimumPayment === 'number') stmt.minimumPayment = parsed.minimumPayment;
  try {
    await stmt.save();
  } catch (e) {
    return { ok: false, aiUsed: false, usedOcr, error: `Save failed: ${(e as Error).message.slice(0, 120)}` };
  }

  revalidatePath('/statements');
  revalidatePath('/items');
  revalidatePath('/shopping');
  return {
    ok: true,
    aiUsed: true,
    usedOcr,
    txCount: newTx.length,
    installmentsFound,
    preservedLinks,
    aiError,
    statement: JSON.parse(JSON.stringify(stmt)),
  };
}
