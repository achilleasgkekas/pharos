'use server';
// "Ask the manual": answer a question from the manual PDFs kept on an item (Files & links).
// Reads the PDFs' text layer, so it costs one text call and never sends the file itself.
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { isFeatureEnabled } from '@/lib/aiFeatures.server';
import { withRequestTenant } from '@/lib/tenancy/request';
import { currentModel } from '@/lib/tenancy/connection';
import { readFile } from '@/lib/storage';
import { extractPdfText, looksLikeScannedPdf } from '@/lib/pdf';
import { runTextJSON } from '@/lib/ollama';
import { Item as ItemModel } from '@/models/Item';

/** About 40k tokens of manual: enough for most appliance manuals, bounded for cost. */
const MAX_CHARS = 160_000;

const Answer = z.object({
  answer: z.string().max(3000).catch(''),
  pages: z.array(z.coerce.number().int().positive()).max(10).catch([]),
  found: z.boolean().catch(true),
});

const PROMPT = `You answer a question about a product using ONLY its manual, given as text with "[page N]" markers. Return ONLY JSON, no markdown:
{ "answer": "…", "pages": [<page numbers you used>], "found": <true if the manual answers it> }
Rules:
- Answer in the language of the question, in short steps or a few sentences.
- Use only what the manual says. If it does not cover the question, set "found": false and say so in one sentence; do not guess.
- Keep safety warnings from the manual that apply to the answer.`;

export type ManualAnswer = { ok: true; answer: string; pages: number[]; found: boolean; manuals: string[] } | { ok: false; error: string };

export async function askItemManual(itemId: string, question: string): Promise<ManualAnswer> {
  await requireUser();
  const q = String(question || '').trim().slice(0, 500);
  if (!q) return { ok: false, error: 'Type a question' };
  if (!/^[a-f0-9]{24}$/i.test(itemId)) return { ok: false, error: 'Item not found' };
  return withRequestTenant(async (): Promise<ManualAnswer> => {
    if (!(await isFeatureEnabled('manualQa'))) return { ok: false, error: 'Ask the manual (AI) is turned off. Turn it on in Settings → AI.' };
    await connectDB();
    const Item = await currentModel(ItemModel);
    const item = await Item.findById(itemId).select('title attachments').lean();
    if (!item) return { ok: false, error: 'Item not found' };
    const pdfs = ((item.attachments ?? []) as { path?: string; name?: string; mimeType?: string }[]).filter(
      (a) => a.path && (a.mimeType === 'application/pdf' || /\.pdf$/i.test(a.path))
    );
    if (!pdfs.length) return { ok: false, error: 'Add the manual as a PDF first (Documents & tag tab).' };

    const parts: string[] = [];
    const used: string[] = [];
    let size = 0;
    for (const a of pdfs.slice(0, 3)) {
      try {
        const text = await extractPdfText(await readFile(a.path as string), { pageMarkers: true });
        if (looksLikeScannedPdf(text.replace(/\[page \d+\]/g, ''))) continue; // a scan with no text layer
        const room = MAX_CHARS - size;
        if (room <= 0) break;
        parts.push(`=== ${a.name || 'manual'} ===\n${text.slice(0, room)}`);
        used.push(a.name || 'manual');
        size += Math.min(text.length, room);
      } catch (err) {
        // Unreadable or missing file: try the next one.
        console.warn(`[ask-manual] ${a.path}: ${(err as Error).message}`);
      }
    }
    if (!parts.length) return { ok: false, error: 'The manual has no readable text (it may be a scan).' };

    try {
      const { json } = await runTextJSON(PROMPT, `Product: ${item.title}\nQuestion: ${q}\n\nManual:\n${parts.join('\n\n')}`, {
        feature: 'manualQa',
        trigger: 'user',
        record: { type: 'item', id: itemId },
      });
      const a = Answer.parse(json);
      if (!a.answer.trim()) return { ok: false, error: 'The AI returned nothing' };
      return { ok: true, answer: a.answer.trim(), pages: a.pages, found: a.found, manuals: used };
    } catch (err) {
      const msg = (err as Error).message || String(err);
      return { ok: false, error: /ECONNREFUSED|fetch failed|ENOTFOUND/i.test(msg) ? 'AI not reachable (check the AI provider)' : `AI failed: ${msg.slice(0, 140)}` };
    }
  });
}
