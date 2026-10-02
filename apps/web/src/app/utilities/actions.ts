'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { assertCanWrite } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { safeDateOrNull } from '@/lib/dates';
import { currentModel } from '@/lib/tenancy/connection';
import { withRequestTenant } from '@/lib/tenancy/request';
import { MeterReading as MeterReadingModel } from '@/models/MeterReading';
import { saveFile } from '@/lib/storage';

const PHOTO_EXT = new Set(['jpg', 'jpeg', 'png', 'webp', 'heic']);

const FormSchema = z.object({
  meter: z.string().trim().min(1, 'Meter name required').max(100),
  utilityType: z.string().trim().min(1, 'Utility type required').max(100),
  unit: z.string().trim().min(1, 'Unit required').max(30),
  readingAt: z.string().min(1, 'Date required'),
  value: z.coerce.number().finite().min(0),
  space: z.string().trim().max(100).default(''),
  notes: z.string().max(1000).default(''),
});

export async function createMeterReading(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  await assertCanWrite();
  const photo = formData.get('photo');
  formData.delete('photo');
  const parsed = FormSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message || 'Invalid reading' };
  const readingAt = safeDateOrNull(parsed.data.readingAt);
  if (!readingAt) return { ok: false, error: 'Invalid date' };
  return withRequestTenant(async () => {
    await connectDB();
    const MeterReading = await currentModel(MeterReadingModel);
    // Keep the meter photo the reading was read from, so it can be checked later.
    let photoPath = '';
    if (photo instanceof File && photo.size > 0 && photo.size <= 15 * 1024 * 1024) {
      const ext = (photo.name.split('.').pop() || '').toLowerCase();
      if (PHOTO_EXT.has(ext)) photoPath = (await saveFile('equipment', Buffer.from(await photo.arrayBuffer()), ext)).relativePath;
    }
    await MeterReading.create({ ...parsed.data, readingAt, photoPath });
    revalidatePath('/utilities');
    return { ok: true };
  });
}

export async function deleteMeterReading(id: string): Promise<{ ok: boolean }> {
  await assertCanWrite();
  return withRequestTenant(async () => {
    await connectDB();
    const MeterReading = await currentModel(MeterReadingModel);
    await MeterReading.updateOne({ _id: id }, { $set: { deletedAt: new Date() } });
    revalidatePath('/utilities');
    return { ok: true };
  });
}
