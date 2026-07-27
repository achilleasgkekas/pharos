'use server';
import { connectDB } from '@/lib/db';
import { GiftCard as GiftCardModel } from '@/models/GiftCard';
import { withRequestTenant } from '@/lib/tenancy/request';
import { currentModel } from '@/lib/tenancy/connection';
import { safeDateOrNull } from '@/lib/dates';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { assertCanWrite } from '@/lib/auth';

// P32 — CRUD + per-use spend/reload for gift cards / store credit. Deterministic,
// no AI. Balance is derived (initialAmount − Σ uses), never stored.
// Tenant-scoped via withRequestTenant/currentModel, same as items/receipts/expenses
// actions — no-op on self-hosted (SAAS_MODE off, single DEFAULT connection), but
// correct per-tenant in SaaS mode.

const GiftCardFormSchema = z.object({
  title: z.string().min(1, 'Title required'),
  store: z.string().default(''),
  code: z.string().default(''),
  initialAmount: z.coerce.number().min(0).default(0),
  expiresAt: z.string().optional().default(''),
  notes: z.string().default(''),
});

export async function createGiftCard(formData: FormData) {
  await assertCanWrite();
  const raw = GiftCardFormSchema.parse(Object.fromEntries(formData));
  return withRequestTenant(async () => {
    await connectDB();
    const GiftCard = await currentModel(GiftCardModel);
    await GiftCard.create({ ...raw, expiresAt: safeDateOrNull(raw.expiresAt), uses: [], archived: false });
    revalidatePath('/vouchers');
  });
}

export async function updateGiftCard(id: string, formData: FormData) {
  await assertCanWrite();
  const raw = GiftCardFormSchema.parse(Object.fromEntries(formData));
  return withRequestTenant(async () => {
    await connectDB();
    const GiftCard = await currentModel(GiftCardModel);
    await GiftCard.findByIdAndUpdate(id, { ...raw, expiresAt: safeDateOrNull(raw.expiresAt) });
    revalidatePath('/vouchers');
  });
}

/** Manually close a card (fully spent / voided) without deleting its history. */
export async function setGiftCardArchived(id: string, archived: boolean) {
  await assertCanWrite();
  return withRequestTenant(async () => {
    await connectDB();
    const GiftCard = await currentModel(GiftCardModel);
    await GiftCard.findByIdAndUpdate(id, { archived });
    revalidatePath('/vouchers');
  });
}

export async function deleteGiftCard(id: string) {
  await assertCanWrite();
  return withRequestTenant(async () => {
    await connectDB();
    const GiftCard = await currentModel(GiftCardModel);
    // Soft delete → Trash (Settings → Storage & data). Purge happens from there.
    await GiftCard.updateOne({ _id: id }, { $set: { deletedAt: new Date() } });
    revalidatePath('/vouchers');
  });
}

/** Record a spend (positive) or reload (negative) against the card's balance. */
export async function addGiftCardUse(id: string, amount: number, note = '', dateStr = ''): Promise<{ ok: boolean; error?: string }> {
  await assertCanWrite();
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt === 0) return { ok: false, error: 'Enter a non-zero amount' };
  return withRequestTenant(async () => {
    await connectDB();
    const GiftCard = await currentModel(GiftCardModel);
    await GiftCard.findByIdAndUpdate(id, {
      $push: { uses: { amount: Math.round(amt * 100) / 100, note: String(note || '').slice(0, 200), date: safeDateOrNull(dateStr) ?? new Date() } },
    });
    revalidatePath('/vouchers');
    return { ok: true };
  });
}

/** Remove a single spend/reload entry from a card. */
export async function removeGiftCardUse(id: string, useId: string) {
  await assertCanWrite();
  return withRequestTenant(async () => {
    await connectDB();
    const GiftCard = await currentModel(GiftCardModel);
    await GiftCard.findByIdAndUpdate(id, { $pull: { uses: { _id: useId } } });
    revalidatePath('/vouchers');
  });
}
