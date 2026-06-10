'use server';
import { connectDB } from '@/lib/db';
import { Card } from '@/models/Card';
import { parseCardImage, type ParsedCard } from '@/lib/ollama';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

export type ScanCardResult = { ok: true; data: ParsedCard } | { ok: false; error: string };

/** OCR a payment-card photo with the local AI and return its details. */
export async function scanCard(formData: FormData): Promise<ScanCardResult> {
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
  await connectDB();
  await Card.findByIdAndUpdate(id, { active });
  revalidatePath('/statements');
}

export async function createCard(formData: FormData) {
  const parsed = CardFormSchema.parse(Object.fromEntries(formData));
  await connectDB();
  await Card.create({ ...parsed, active: true });
  revalidatePath('/statements');
}

export async function updateCard(id: string, formData: FormData) {
  const parsed = CardFormSchema.parse(Object.fromEntries(formData));
  await connectDB();
  await Card.findByIdAndUpdate(id, parsed);
  revalidatePath('/statements');
}

export async function deleteCard(id: string) {
  await connectDB();
  await Card.findByIdAndDelete(id);
  revalidatePath('/statements');
}
