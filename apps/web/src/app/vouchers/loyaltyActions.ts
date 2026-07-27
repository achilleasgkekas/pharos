'use server';
import { connectDB } from '@/lib/db';
import { LoyaltyCard as LoyaltyCardModel } from '@/models/LoyaltyCard';
import { withRequestTenant } from '@/lib/tenancy/request';
import { currentModel } from '@/lib/tenancy/connection';
import { resolveBarcodeFormat } from '@/lib/loyaltyCard';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { assertCanWrite } from '@/lib/auth';

// P20 — CRUD for the loyalty/membership card wallet. No balance to track (unlike
// GiftCard/P32) — just an identity card the checkout scanner reads.
// Tenant-scoped via withRequestTenant/currentModel, same as items/receipts/expenses
// actions — no-op on self-hosted (SAAS_MODE off, single DEFAULT connection), but
// correct per-tenant in SaaS mode.

const LoyaltyCardFormSchema = z.object({
  title: z.string().min(1, 'Title required'),
  store: z.string().default(''),
  cardNumber: z.string().min(1, 'Card number required'),
  barcodeFormat: z.string().default(''),
  notes: z.string().default(''),
});

export async function createLoyaltyCard(formData: FormData) {
  await assertCanWrite();
  const raw = LoyaltyCardFormSchema.parse(Object.fromEntries(formData));
  return withRequestTenant(async () => {
    await connectDB();
    const LoyaltyCard = await currentModel(LoyaltyCardModel);
    await LoyaltyCard.create({ ...raw, barcodeFormat: resolveBarcodeFormat(raw.barcodeFormat, raw.cardNumber), archived: false });
    revalidatePath('/vouchers');
  });
}

export async function updateLoyaltyCard(id: string, formData: FormData) {
  await assertCanWrite();
  const raw = LoyaltyCardFormSchema.parse(Object.fromEntries(formData));
  return withRequestTenant(async () => {
    await connectDB();
    const LoyaltyCard = await currentModel(LoyaltyCardModel);
    await LoyaltyCard.findByIdAndUpdate(id, { ...raw, barcodeFormat: resolveBarcodeFormat(raw.barcodeFormat, raw.cardNumber) });
    revalidatePath('/vouchers');
  });
}

/** Manually hide a card (e.g. account closed) without deleting its history. */
export async function setLoyaltyCardArchived(id: string, archived: boolean) {
  await assertCanWrite();
  return withRequestTenant(async () => {
    await connectDB();
    const LoyaltyCard = await currentModel(LoyaltyCardModel);
    await LoyaltyCard.findByIdAndUpdate(id, { archived });
    revalidatePath('/vouchers');
  });
}

export async function deleteLoyaltyCard(id: string) {
  await assertCanWrite();
  return withRequestTenant(async () => {
    await connectDB();
    const LoyaltyCard = await currentModel(LoyaltyCardModel);
    // Soft delete → Trash (Settings → Storage & data). Purge happens from there.
    await LoyaltyCard.updateOne({ _id: id }, { $set: { deletedAt: new Date() } });
    revalidatePath('/vouchers');
  });
}
