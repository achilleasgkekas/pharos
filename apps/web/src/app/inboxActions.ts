'use server';
// The AI inbox on Home (lib/inboxRouter). `classifyInboxFile` only reads the file and says
// where it belongs. Saving goes through each page's own import (receipts, expenses, income,
// statements) from the browser; bills and documents have no file import of their own, so
// `inboxToBill` / `inboxToDocument` here read the file, create the record and keep the file
// on it (Files & links).
import { revalidatePath } from 'next/cache';
import { unstable_rethrow } from 'next/navigation';
import { assertCanWrite, requireUser } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { isFeatureEnabled } from '@/lib/aiFeatures.server';
import { withRequestTenant } from '@/lib/tenancy/request';
import { currentModel } from '@/lib/tenancy/connection';
import { runTextJSON, runVisionJSON } from '@/lib/ollama';
import { extractPdfText, looksLikeScannedPdf } from '@/lib/pdf';
import { pdfFirstPageJpeg } from '@/lib/pdfThumb';
import { saveFile } from '@/lib/storage';
import { scanHomeFile } from '@/lib/homeScan.server';
import { INBOX_PROMPT, normalizeGuess, type InboxGuess } from '@/lib/inboxRouter';
import { canonicalCategory, isBuiltInCategory } from '@/lib/categories';
import { Bill as BillModel } from '@/models/Bill';
import { Document as DocumentModel } from '@/models/Document';

const MAX_BYTES = 15 * 1024 * 1024;
const MIME: Record<string, string> = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic' };

type FileIn = { file: File; ext: string; bytes: Buffer };

async function readFileIn(formData: FormData): Promise<FileIn | string> {
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) return 'No file';
  if (file.size > MAX_BYTES) return 'File too large (max 15MB)';
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (!MIME[ext]) return 'Use a photo or a PDF';
  return { file, ext, bytes: Buffer.from(await file.arrayBuffer()) };
}

const aiError = (err: unknown) => {
  const msg = (err as Error)?.message || String(err);
  return /ECONNREFUSED|fetch failed|ENOTFOUND/i.test(msg) ? 'AI not reachable (check the AI provider)' : `AI failed: ${msg.slice(0, 140)}`;
};

/** Anything that still throws (a file the PDF reader chokes on, a lost database) comes back
 *  as a readable message and lands in the server log, instead of React's masked
 *  "error #441" in production. Redirects and other framework signals pass through. */
function unexpected(where: string, err: unknown): { ok: false; error: string } {
  unstable_rethrow(err);
  console.error(`[inbox] ${where} failed:`, err);
  return { ok: false, error: `Could not ${where === 'classify' ? 'read' : 'save'} the file: ${((err as Error)?.message || String(err)).slice(0, 160)}` };
}

export async function classifyInboxFile(formData: FormData): Promise<{ ok: true; guess: InboxGuess } | { ok: false; error: string }> {
  try {
    return await classify(formData);
  } catch (err) {
    return unexpected('classify', err);
  }
}

async function classify(formData: FormData): Promise<{ ok: true; guess: InboxGuess } | { ok: false; error: string }> {
  await requireUser();
  const f = await readFileIn(formData);
  if (typeof f === 'string') return { ok: false, error: f };
  return withRequestTenant(async () => {
    if (!(await isFeatureEnabled('inbox'))) return { ok: false as const, error: 'The AI inbox is turned off. Turn it on in Settings → AI.' };
    const isPdf = f.ext === 'pdf';
    const meta = { feature: 'inbox' as const, trigger: 'user' as const };
    try {
      let json: unknown;
      if (isPdf) {
        const text = await extractPdfText(f.bytes);
        if (!looksLikeScannedPdf(text)) {
          json = (await runTextJSON(INBOX_PROMPT, `Where does this file belong?\n\n${text.slice(0, 12_000)}`, meta)).json;
        } else {
          const img = await pdfFirstPageJpeg(f.bytes, 1200);
          if (!img) return { ok: false as const, error: 'Could not read the PDF' };
          json = (await runVisionJSON(INBOX_PROMPT, 'Where does this file belong?', [img.toString('base64')], meta)).json;
        }
      } else {
        json = (await runVisionJSON(INBOX_PROMPT, 'Where does this file belong?', [f.bytes.toString('base64')], meta)).json;
      }
      return { ok: true as const, guess: normalizeGuess(json, isPdf) };
    } catch (err) {
      return { ok: false as const, error: aiError(err) };
    }
  });
}

/** The file as a Files & links entry. */
async function keepFile(f: FileIn) {
  const { relativePath } = await saveFile('equipment', f.bytes, f.ext);
  return { path: relativePath, url: '', name: f.file.name.slice(0, 200), mimeType: MIME[f.ext], size: f.file.size, uploadedAt: new Date() };
}

const day = (s: string | null | undefined) => {
  const d = s ? new Date(`${s}T12:00:00Z`) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
};

/** Save the file as a bill to pay: read it (when the bill scan is on), create the bill, keep the file. */
export async function inboxToBill(formData: FormData, hint: { title?: string; amount?: number | null; date?: string | null }): Promise<{ ok: boolean; id?: string; error?: string }> {
  await assertCanWrite();
  try {
    const f = await readFileIn(formData);
    if (typeof f === 'string') return { ok: false, error: f };
    return await withRequestTenant(async () => {
      await connectDB();
      let scan: Awaited<ReturnType<typeof scanHomeFile<'bill'>>> | null = null;
      if (await isFeatureEnabled('bills')) scan = await scanHomeFile('bill', f.bytes, f.ext).catch(() => null);
      const extra = [scan?.paymentCode && `Payment code: ${scan.paymentCode}`, scan?.periodFrom && scan?.periodTo && `Period: ${scan.periodFrom} – ${scan.periodTo}`].filter(Boolean).join(' · ');
      const Bill = await currentModel(BillModel);
      const bill = await Bill.create({
        title: (scan?.title || scan?.vendor || hint.title || f.file.name).slice(0, 120),
        vendor: scan?.vendor || hint.title || '',
        amount: scan?.amount ?? (typeof hint.amount === 'number' ? hint.amount : 0),
        // A bill needs a due date; without one it is due today, and the page says so to check.
        dueDate: day(scan?.dueDate) ?? day(hint.date) ?? new Date(),
        category: scan?.category && isBuiltInCategory(scan.category) ? canonicalCategory(scan.category) : 'utilities',
        notes: extra,
        attachments: [await keepFile(f)],
      });
      revalidatePath('/expenses', 'layout');
      return { ok: true, id: String(bill._id) };
    });
  } catch (err) {
    return unexpected('save', err);
  }
}

/** Save the file as a personal document: read it (when the document scan is on), create it, keep the file. */
export async function inboxToDocument(formData: FormData, hint: { title?: string; date?: string | null }): Promise<{ ok: boolean; id?: string; error?: string }> {
  await assertCanWrite();
  try {
    const f = await readFileIn(formData);
    if (typeof f === 'string') return { ok: false, error: f };
    return await withRequestTenant(async () => {
      await connectDB();
      let scan: Awaited<ReturnType<typeof scanHomeFile<'document'>>> | null = null;
      if (await isFeatureEnabled('documents')) scan = await scanHomeFile('document', f.bytes, f.ext).catch(() => null);
      const expiry = day(scan?.expiryDate) ?? day(hint.date);
      const Document = await currentModel(DocumentModel);
      const doc = await Document.create({
        title: (scan?.title || hint.title || f.file.name).slice(0, 120),
        type: scan?.type || '',
        holder: scan?.holder || '',
        number: scan?.number || '',
        issuedAt: day(scan?.issuedAt),
        // A document needs an expiry; when none was read it is set a year out and noted.
        expiryDate: expiry ?? new Date(Date.now() + 365 * 24 * 3600 * 1000),
        notes: expiry ? '' : 'No expiry date was found on the file: check it.',
        attachments: [await keepFile(f)],
      });
      revalidatePath('/documents');
      return { ok: true, id: String(doc._id) };
    });
  } catch (err) {
    return unexpected('save', err);
  }
}
