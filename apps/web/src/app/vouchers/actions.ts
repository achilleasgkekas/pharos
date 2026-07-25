'use server';
import { connectDB } from '@/lib/db';
import { Voucher as VoucherModel } from '@/models/Voucher';
import { withRequestTenant } from '@/lib/tenancy/request';
import { currentModel } from '@/lib/tenancy/connection';
import { safeDateOrNull } from '@/lib/dates';
import { parseVoucherText, parseVoucherImage, type ParsedVoucher } from '@/lib/ollama';
import { isFeatureEnabled } from '@/lib/aiFeatures.server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

export type ScanVoucherResult = { ok: true; data: ParsedVoucher } | { ok: false; error: string };

function aiError(err: unknown): string {
  const msg = (err as Error).message || String(err);
  return /ECONNREFUSED|fetch failed|ENOTFOUND/i.test(msg) ? 'AI not reachable (check Ollama / provider)' : `AI failed: ${msg.slice(0, 120)}`;
}

/** Parse a pasted voucher/coupon text with AI → form fields (no save). */
export async function scanVoucherText(text: string): Promise<ScanVoucherResult> {
  if (!(await isFeatureEnabled('vouchers'))) return { ok: false, error: 'Voucher scanning (AI) is turned off.' };
  if (!text.trim()) return { ok: false, error: 'Paste some voucher text first' };
  try {
    const { parsed } = await parseVoucherText(text);
    return { ok: true, data: parsed };
  } catch (err) {
    return { ok: false, error: aiError(err) };
  }
}

/** OCR/vision-parse a voucher screenshot/photo with AI → form fields (no save). */
export async function scanVoucherImage(formData: FormData): Promise<ScanVoucherResult> {
  if (!(await isFeatureEnabled('vouchers'))) return { ok: false, error: 'Voucher scanning (AI) is turned off.' };
  const file = formData.get('file');
  if (!file || !(file instanceof File) || file.size === 0) return { ok: false, error: 'No image' };
  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    const { parsed } = await parseVoucherImage(bytes.toString('base64'));
    return { ok: true, data: parsed };
  } catch (err) {
    return { ok: false, error: aiError(err) };
  }
}

const VoucherFormSchema = z.object({
  title: z.string().min(1, 'Title required'),
  code: z.string().default(''),
  store: z.string().default(''),
  discount: z.string().default(''),
  expiresAt: z.string().optional().default(''),
  url: z.string().default(''),
  notes: z.string().default(''),
});

export async function createVoucher(formData: FormData) {
  const raw = VoucherFormSchema.parse(Object.fromEntries(formData));
  return withRequestTenant(async () => {
    await connectDB();
    const Voucher = await currentModel(VoucherModel);
    await Voucher.create({ ...raw, expiresAt: safeDateOrNull(raw.expiresAt), used: false });
    revalidatePath('/vouchers');
  });
}

export async function updateVoucher(id: string, formData: FormData) {
  const raw = VoucherFormSchema.parse(Object.fromEntries(formData));
  return withRequestTenant(async () => {
    await connectDB();
    const Voucher = await currentModel(VoucherModel);
    await Voucher.findByIdAndUpdate(id, { ...raw, expiresAt: safeDateOrNull(raw.expiresAt) });
    revalidatePath('/vouchers');
  });
}

export async function toggleVoucherUsed(id: string, used: boolean) {
  return withRequestTenant(async () => {
    await connectDB();
    const Voucher = await currentModel(VoucherModel);
    await Voucher.findByIdAndUpdate(id, { used });
    revalidatePath('/vouchers');
  });
}

export async function deleteVoucher(id: string) {
  return withRequestTenant(async () => {
    await connectDB();
    const Voucher = await currentModel(VoucherModel);
    // Soft delete → Trash (Settings → Storage & data). Purge happens from there.
    await Voucher.updateOne({ _id: id }, { $set: { deletedAt: new Date() } });
    revalidatePath('/vouchers');
  });
}
