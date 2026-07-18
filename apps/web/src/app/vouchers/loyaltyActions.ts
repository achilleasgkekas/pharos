'use server';
import { connectDB } from '@/lib/db';
import { LoyaltyCard } from '@/models/LoyaltyCard';
import { resolveBarcodeFormat } from '@/lib/loyaltyCard';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

// P20 — CRUD for the loyalty/membership card wallet. No balance to track (unlike
// GiftCard/P32) — just an identity card the checkout scanner reads.

const LoyaltyCardFormSchema = z.object({
  title: z.string().min(1, 'Title required'),
  store: z.string().default(''),
  cardNumber: z.string().min(1, 'Card number required'),
  barcodeFormat: z.string().default(''),
  notes: z.string().default(''),
});

export async function createLoyaltyCard(formData: FormData) {
  const raw = LoyaltyCardFormSchema.parse(Object.fromEntries(formData));
  await connectDB();
  await LoyaltyCard.create({ ...raw, barcodeFormat: resolveBarcodeFormat(raw.barcodeFormat, raw.cardNumber), archived: false });
  revalidatePath('/vouchers');
}

export async function updateLoyaltyCard(id: string, formData: FormData) {
  const raw = LoyaltyCardFormSchema.parse(Object.fromEntries(formData));
  await connectDB();
  await LoyaltyCard.findByIdAndUpdate(id, { ...raw, barcodeFormat: resolveBarcodeFormat(raw.barcodeFormat, raw.cardNumber) });
  revalidatePath('/vouchers');
}

/** Manually hide a card (e.g. account closed) without deleting its history. */
export async function setLoyaltyCardArchived(id: string, archived: boolean) {
  await connectDB();
  await LoyaltyCard.findByIdAndUpdate(id, { archived });
  revalidatePath('/vouchers');
}

export async function deleteLoyaltyCard(id: string) {
  await connectDB();
  // Soft delete → Trash (Settings → Storage & data). Purge happens from there.
  await LoyaltyCard.updateOne({ _id: id }, { $set: { deletedAt: new Date() } });
  revalidatePath('/vouchers');
}
