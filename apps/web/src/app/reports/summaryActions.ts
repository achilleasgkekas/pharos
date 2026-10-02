'use server';
// "Explain this period": a few plain sentences on top of the Reports overview. Runs only when
// the user asks (a button), so it never spends anything on its own. The page already holds the
// figures, so it sends a short digest of them rather than the AI reading the database.
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { isFeatureEnabled } from '@/lib/aiFeatures.server';
import { withRequestTenant } from '@/lib/tenancy/request';
import { runTextJSON } from '@/lib/ollama';

const Row = z.object({ name: z.string().max(80), value: z.number().finite(), prev: z.number().finite().default(0) });

const DigestSchema = z.object({
  locale: z.string().max(5),
  currency: z.string().max(5),
  period: z.string().max(60),
  prevPeriod: z.string().max(60),
  spent: z.number().finite(),
  prevSpent: z.number().finite(),
  income: z.number().finite(),
  prevIncome: z.number().finite(),
  receipts: z.number().finite(),
  prevReceipts: z.number().finite(),
  categories: z.array(Row).max(8),
  stores: z.array(Row).max(8),
});
export type ReportDigest = z.input<typeof DigestSchema>;

const Answer = z.object({ sentences: z.array(z.string().max(300)).max(5).catch([]) });

const LANGUAGE: Record<string, string> = { en: 'English', el: 'Greek', de: 'German', es: 'Spanish', fr: 'French', it: 'Italian', nl: 'Dutch', pt: 'Portuguese' };

const PROMPT = `You explain a household's spending for a period, like a friend who is good with money. You get a JSON digest of the period and the one before it. Return ONLY JSON, no markdown:
{ "sentences": ["…", "…"] }
Rules:
- 3 or 4 short sentences, plain words, no headings, no bullet characters, no emojis.
- Lead with what changed most and why (which categories or stores drove it), with the amounts.
- Compare with the previous period when it has data; if it has none, do not compare.
- Mention one concrete, kind suggestion only when something clearly stands out.
- Use only the numbers in the digest. Never invent a cause, a store or a figure.
- Write in the language you are told, with amounts as "<number> <currency>".`;

export async function summarizeReport(input: ReportDigest): Promise<{ ok: true; sentences: string[] } | { ok: false; error: string }> {
  await requireUser();
  const parsed = DigestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Invalid report data' };
  const d = parsed.data;
  return withRequestTenant(async () => {
    if (!(await isFeatureEnabled('reportSummary'))) return { ok: false as const, error: 'The report summary (AI) is turned off. Turn it on in Settings → AI.' };
    const lang = LANGUAGE[d.locale] ?? 'English';
    const round = (n: number) => Math.round(n * 100) / 100;
    const digest = {
      ...d,
      spent: round(d.spent),
      prevSpent: round(d.prevSpent),
      income: round(d.income),
      prevIncome: round(d.prevIncome),
      categories: d.categories.map((r) => ({ ...r, value: round(r.value), prev: round(r.prev) })),
      stores: d.stores.map((r) => ({ ...r, value: round(r.value), prev: round(r.prev) })),
    };
    try {
      const { json } = await runTextJSON(PROMPT, `Language: ${lang}\n\n${JSON.stringify(digest)}`, { feature: 'reportSummary', trigger: 'user' });
      const sentences = Answer.parse(json).sentences.map((s) => s.trim()).filter(Boolean);
      if (!sentences.length) return { ok: false as const, error: 'The AI returned nothing' };
      return { ok: true as const, sentences };
    } catch (err) {
      const msg = (err as Error).message || String(err);
      return { ok: false as const, error: /ECONNREFUSED|fetch failed|ENOTFOUND/i.test(msg) ? 'AI not reachable (check the AI provider)' : `AI failed: ${msg.slice(0, 140)}` };
    }
  });
}
