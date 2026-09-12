'use server';
import { connectDB } from '@/lib/db';
import { SpecialDate as SpecialDateModel } from '@/models/SpecialDate';
import { withRequestTenant } from '@/lib/tenancy/request';
import { currentModel } from '@/lib/tenancy/connection';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { assertCanWrite } from '@/lib/auth';

// P50 — CRUD for recurring personal dates. Deterministic, no AI. "Days until" is derived on
// read (lib/specialDates.ts), never stored — the record only holds month/day (+ optional year).

const SpecialDateFormSchema = z.object({
  name: z.string().min(1, 'Name required'),
  type: z.string().default('birthday'),
  month: z.coerce.number().int().min(1, 'Month 1–12').max(12, 'Month 1–12'),
  day: z.coerce.number().int().min(1, 'Day 1–31').max(31, 'Day 1–31'),
  year: z.coerce.number().int().min(0).max(9999).default(0),
  notes: z.string().default(''),
});

function fields(raw: z.infer<typeof SpecialDateFormSchema>) {
  return {
    name: raw.name.trim(),
    type: raw.type.trim() || 'birthday',
    month: raw.month,
    day: raw.day,
    year: raw.year > 0 ? raw.year : 0,
    notes: raw.notes.trim(),
  };
}

export async function createSpecialDate(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  await assertCanWrite();
  const parsed = SpecialDateFormSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message || 'Invalid data' };
  return withRequestTenant(async () => {
    await connectDB();
    const SpecialDate = await currentModel(SpecialDateModel);
    await SpecialDate.create({ ...fields(parsed.data), archived: false });
    revalidatePath('/special-dates');
    return { ok: true };
  });
}

export async function updateSpecialDate(id: string, formData: FormData): Promise<{ ok: boolean; error?: string }> {
  await assertCanWrite();
  const parsed = SpecialDateFormSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message || 'Invalid data' };
  return withRequestTenant(async () => {
    await connectDB();
    const SpecialDate = await currentModel(SpecialDateModel);
    const res = await SpecialDate.updateOne({ _id: id }, { $set: fields(parsed.data) });
    if (!res.matchedCount) return { ok: false, error: 'Date not found' };
    revalidatePath('/special-dates');
    return { ok: true };
  });
}

export async function setSpecialDateArchived(id: string, archived: boolean): Promise<{ ok: boolean }> {
  await assertCanWrite();
  return withRequestTenant(async () => {
    await connectDB();
    const SpecialDate = await currentModel(SpecialDateModel);
    await SpecialDate.updateOne({ _id: id }, { $set: { archived: !!archived } });
    revalidatePath('/special-dates');
    return { ok: true };
  });
}

export async function deleteSpecialDate(id: string): Promise<{ ok: boolean }> {
  await assertCanWrite();
  return withRequestTenant(async () => {
    await connectDB();
    const SpecialDate = await currentModel(SpecialDateModel);
    await SpecialDate.updateOne({ _id: id }, { $set: { deletedAt: new Date() } });
    revalidatePath('/special-dates');
    return { ok: true };
  });
}
