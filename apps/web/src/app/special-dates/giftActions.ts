'use server';
// Gift ideas for a birthday / nameday / anniversary, and the one click that puts an idea on the
// wishlist. The AI only sees what the user typed on the date (name, type, notes, age) plus an
// optional budget and hint, never other records.
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { assertCanWrite, requireUser } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { isFeatureEnabled } from '@/lib/aiFeatures.server';
import { withRequestTenant } from '@/lib/tenancy/request';
import { currentModel } from '@/lib/tenancy/connection';
import { runTextJSON } from '@/lib/ollama';
import { yearsAtNextOccurrence } from '@/lib/specialDates';
import { SpecialDate as SpecialDateModel } from '@/models/SpecialDate';
import { Item as ItemModel } from '@/models/Item';

export type GiftIdea = { title: string; why: string; price: number | null };

const Ideas = z.object({
  ideas: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(120),
        why: z.string().trim().max(240).catch(''),
        price: z.coerce.number().nonnegative().nullable().catch(null),
      })
    )
    .max(6)
    .catch([]),
});

const LANGUAGE: Record<string, string> = { en: 'English', el: 'Greek', de: 'German', es: 'Spanish', fr: 'French', it: 'Italian', nl: 'Dutch', pt: 'Portuguese' };

const PROMPT = `You suggest gifts for a person, for an occasion. Return ONLY JSON, no markdown:
{ "ideas": [ { "title": "a specific gift, e.g. 'Kindle Paperwhite' or 'Pottery class for two'", "why": "one short sentence on why it fits", "price": <a typical price in the given currency, or null> } ] }
Rules:
- 5 ideas, varied (one experience, one practical, one personal touch), within the budget when one is given.
- Base them on the notes and hint. If they say little, keep the ideas broadly liked; never assume gender or religion from a name.
- Titles a shop would recognise, so the idea can go on a wishlist. No links.
- Write in the language you are told.`;

export async function suggestGiftIdeas(
  dateId: string,
  input: { budget?: number | null; hint?: string; locale?: string; currency?: string }
): Promise<{ ok: true; ideas: GiftIdea[] } | { ok: false; error: string }> {
  await requireUser();
  if (!/^[a-f0-9]{24}$/i.test(dateId)) return { ok: false, error: 'Not found' };
  return withRequestTenant(async () => {
    if (!(await isFeatureEnabled('giftIdeas'))) return { ok: false as const, error: 'Gift ideas (AI) are turned off. Turn them on in Settings → AI.' };
    await connectDB();
    const SpecialDate = await currentModel(SpecialDateModel);
    const d = await SpecialDate.findById(dateId).select('name type notes month day year').lean();
    if (!d) return { ok: false as const, error: 'Not found' };
    const age = d.year ? yearsAtNextOccurrence(d.year, d.month, d.day) : null;
    const budget = typeof input.budget === 'number' && input.budget > 0 ? Math.round(input.budget) : null;
    const facts = {
      who: d.name,
      occasion: d.type || 'birthday',
      ageOrYears: age,
      notes: String(d.notes || '').slice(0, 600),
      hint: String(input.hint || '').slice(0, 300),
      budget,
      currency: String(input.currency || 'EUR').slice(0, 5),
    };
    try {
      const { json } = await runTextJSON(PROMPT, `Language: ${LANGUAGE[input.locale || 'en'] ?? 'English'}\n\n${JSON.stringify(facts)}`, {
        feature: 'giftIdeas',
        trigger: 'user',
        record: { type: 'specialDate', id: dateId },
      });
      const ideas = Ideas.parse(json).ideas;
      if (!ideas.length) return { ok: false as const, error: 'The AI returned nothing' };
      return { ok: true as const, ideas };
    } catch (err) {
      const msg = (err as Error).message || String(err);
      return { ok: false as const, error: /ECONNREFUSED|fetch failed|ENOTFOUND/i.test(msg) ? 'AI not reachable (check the AI provider)' : `AI failed: ${msg.slice(0, 140)}` };
    }
  });
}

/** Put a gift idea on the wishlist (status "researching", tagged "gift"). */
export async function addGiftToWishlist(input: { title: string; price: number | null; forName: string }): Promise<{ ok: boolean; error?: string }> {
  await assertCanWrite();
  const title = String(input.title || '').trim().slice(0, 200);
  if (!title) return { ok: false, error: 'Title required' };
  const price = typeof input.price === 'number' && input.price > 0 ? Math.round(input.price * 100) / 100 : 0;
  return withRequestTenant(async () => {
    await connectDB();
    const Item = await currentModel(ItemModel);
    await Item.create({
      title,
      status: 'researching',
      category: 'other',
      currentPrice: price,
      tags: ['gift'],
      notes: String(input.forName || '').trim() ? `🎁 ${String(input.forName).trim().slice(0, 100)}` : '',
    });
    revalidatePath('/shopping');
    return { ok: true };
  });
}
