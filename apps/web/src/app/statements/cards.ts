'use server';
import { connectDB } from '@/lib/db';
import { Card as CardModel } from '@/models/Card';
import { parseCardImage, type ParsedCard } from '@/lib/ollama';
import { isFeatureEnabled } from '@/lib/aiFeatures.server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { assertCanWrite } from '@/lib/auth';
import { withRequestTenant } from '@/lib/tenancy/request';
import { currentModel } from '@/lib/tenancy/connection';

/**
 * The payment cards of the CALLER'S workspace.
 *
 * These four writers used the imported model directly, so in SaaS mode every workspace created,
 * renamed, deactivated and deleted payment cards in the DEFAULT database: one shared set of cards
 * for all customers, and `deleteCard` removing another customer's card. The reader on the same
 * screen (statements/page.tsx) had the same fault, so the split was invisible from the UI: both
 * sides were consistently wrong. Both are gated in this pass, which is why the batch is the whole
 * card surface and not only its writers.
 *
 * `withRequestTenant` also enforces the membership/status check, so an account that is not a member
 * of the workspace named in the host cannot touch its cards. Self-hosted resolves to the default
 * tenant with zero work, so `scoped(Card)` is exactly `Card` there.
 */
function scoped() {
  return withRequestTenant(() => currentModel(CardModel));
}

export type ScanCardResult = { ok: true; data: ParsedCard } | { ok: false; error: string };

/** OCR a payment-card photo with the local AI and return its details. */
export async function scanCard(formData: FormData): Promise<ScanCardResult> {
  // Inside the gate although it never touches the database: `isFeatureEnabled` reads the
  // workspace's own AI switches, and the AI dispatch meters the call against the tenant's plan
  // (lib/billing/aiMeter). Ungated, a customer's card scan was billed to nobody.
  return withRequestTenant(async () => {
    if (!(await isFeatureEnabled('cards'))) return { ok: false, error: 'Card scanning (AI) is turned off.' };
    const file = formData.get('file');
    if (!file || !(file instanceof File) || file.size === 0) {
      return { ok: false, error: 'No image' };
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    try {
      const { parsed } = await parseCardImage(bytes.toString('base64'));
      return { ok: true, data: parsed };
    } catch (err) {
      const msg = (err as Error).message || String(err);
      return {
        ok: false,
        error: /ECONNREFUSED|fetch failed|ENOTFOUND/i.test(msg) ? 'Ollama is not reachable' : `AI failed: ${msg.slice(0, 100)}`,
      };
    }
  });
}

const CardFormSchema = z.object({
  name: z.string().min(1, 'Name required'),
  last4: z.string().max(4).default(''),
  bank: z.string().default(''),
  kind: z.enum(['credit', 'debit']).default('credit'),
  type: z.enum(['mastercard', 'visa', 'amex', 'maestro', 'other']).default('other'),
  color: z.string().default('#00d4ff'),
  creditLimit: z.coerce.number().default(0),
  notes: z.string().default(''),
});

export async function toggleCardActive(id: string, active: boolean) {
  await assertCanWrite();
  await connectDB();
  const Card = await scoped();
  await Card.findByIdAndUpdate(id, { active });
  revalidatePath('/statements');
}

export async function createCard(formData: FormData) {
  await assertCanWrite();
  const parsed = CardFormSchema.parse(Object.fromEntries(formData));
  await connectDB();
  const Card = await scoped();
  await Card.create({ ...parsed, active: true });
  revalidatePath('/statements');
}

export async function updateCard(id: string, formData: FormData) {
  await assertCanWrite();
  const parsed = CardFormSchema.parse(Object.fromEntries(formData));
  await connectDB();
  const Card = await scoped();
  await Card.findByIdAndUpdate(id, parsed);
  revalidatePath('/statements');
}

export async function deleteCard(id: string) {
  await assertCanWrite();
  await connectDB();
  const Card = await scoped();
  await Card.findByIdAndDelete(id);
  revalidatePath('/statements');
}
