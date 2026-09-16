'use server';

import { revalidatePath } from 'next/cache';
import { connectDB } from '@/lib/db';
import { ShoppingListItem as ShoppingListItemModel } from '@/models/ShoppingListItem';
import { withRequestTenant } from '@/lib/tenancy/request';
import { currentModel } from '@/lib/tenancy/connection';
import { parseProductPhoto, type ParsedProductPhoto } from '@/lib/ollama';
import { isFeatureEnabled } from '@/lib/aiFeatures.server';
import { assertCanWrite } from '@/lib/auth';
import { resurfaceDueRestocks } from '@/lib/shoppingListRestock';

export type SerializedListItem = {
  _id: string;
  name: string;
  quantity: string;
  category: string;
  brand: string;
  note: string;
  checked: boolean;
  aiScanned: boolean;
  restockIntervalDays: number | null;
  lastRestockedAt: string | null;
  createdAt: string;
};

type ListItemLean = {
  _id: unknown;
  name: string;
  quantity?: string;
  category?: string;
  brand?: string;
  note?: string;
  checked?: boolean;
  aiScanned?: boolean;
  restockIntervalDays?: number;
  lastRestockedAt?: Date;
  createdAt: Date;
};

function serialize(d: ListItemLean): SerializedListItem {
  return {
    _id: String(d._id),
    name: d.name,
    quantity: d.quantity ?? '',
    category: d.category ?? '',
    brand: d.brand ?? '',
    note: d.note ?? '',
    checked: !!d.checked,
    aiScanned: !!d.aiScanned,
    restockIntervalDays: d.restockIntervalDays ?? null,
    lastRestockedAt: d.lastRestockedAt ? new Date(d.lastRestockedAt).toISOString() : null,
    createdAt: new Date(d.createdAt).toISOString(),
  };
}

export type ScanProductResult = { ok: true; data: ParsedProductPhoto } | { ok: false; error: string };

function aiError(err: unknown): string {
  const msg = (err as Error).message || String(err);
  return /ECONNREFUSED|fetch failed|ENOTFOUND/i.test(msg) ? 'AI not reachable (check Ollama / provider)' : `AI failed: ${msg.slice(0, 120)}`;
}

export async function getListItems(): Promise<SerializedListItem[]> {
  return withRequestTenant(async () => {
    await connectDB();
    const ShoppingListItem = await currentModel(ShoppingListItemModel);
    await resurfaceDueRestocks(ShoppingListItem);
    // Unchecked first, then newest. Checked items sink to the bottom.
    const docs = (await ShoppingListItem.find().sort({ checked: 1, createdAt: -1 }).lean()) as ListItemLean[];
    return docs.map(serialize);
  });
}

/** Vision-parse a product photo → suggested list entry (no save; the user verifies). */
export async function scanProductPhoto(formData: FormData): Promise<ScanProductResult> {
  if (!(await isFeatureEnabled('productPhoto'))) return { ok: false, error: 'Product photo scanning (AI) is turned off.' };
  const file = formData.get('file');
  if (!file || !(file instanceof File) || file.size === 0) return { ok: false, error: 'No image' };
  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    const { parsed } = await parseProductPhoto(bytes.toString('base64'));
    return { ok: true, data: parsed };
  } catch (err) {
    return { ok: false, error: aiError(err) };
  }
}

type NewItem = { name: string; quantity?: string; category?: string; brand?: string; note?: string; aiScanned?: boolean; restockIntervalDays?: number | null };

function validRestockDays(value: number | null | undefined): number | undefined {
  if (value == null) return undefined;
  return Number.isInteger(value) && value > 0 && value <= 3650 ? value : undefined;
}

export async function addListItem(data: NewItem): Promise<{ ok: boolean; error?: string }> {
  await assertCanWrite();
  const name = (data.name || '').trim();
  if (!name) return { ok: false, error: 'Name required' };
  if (data.restockIntervalDays != null && validRestockDays(data.restockIntervalDays) === undefined) return { ok: false, error: 'Restock interval must be a whole number from 1 to 3650' };
  return withRequestTenant(async () => {
    await connectDB();
    const ShoppingListItem = await currentModel(ShoppingListItemModel);
    await ShoppingListItem.create({
      name,
      quantity: (data.quantity || '').trim(),
      category: (data.category || '').trim(),
      brand: (data.brand || '').trim(),
      note: (data.note || '').trim(),
      aiScanned: !!data.aiScanned,
      checked: false,
      restockIntervalDays: validRestockDays(data.restockIntervalDays),
    });
    revalidatePath('/shopping-list');
    return { ok: true };
  });
}

// `found` reports whether a live (non-trashed) doc matched — lets the REST layer
// return 404 instead of a silent success. The web UI ignores the return value.
export async function updateListItem(id: string, data: Partial<NewItem>): Promise<{ ok: boolean; found: boolean }> {
  await assertCanWrite();
  const set: Record<string, string> = {};
  for (const k of ['name', 'quantity', 'category', 'brand', 'note'] as const) {
    if (data[k] !== undefined) set[k] = String(data[k]).trim();
  }
  const unset: Record<string, 1> = {};
  if (data.restockIntervalDays !== undefined) {
    if (data.restockIntervalDays === null) unset.restockIntervalDays = 1;
    else if (validRestockDays(data.restockIntervalDays) !== undefined) (set as Record<string, string | number>).restockIntervalDays = data.restockIntervalDays;
  }
  return withRequestTenant(async () => {
    await connectDB();
    const ShoppingListItem = await currentModel(ShoppingListItemModel);
    const update = Object.keys(unset).length ? { $set: set, $unset: unset } : { $set: set };
    const r = await ShoppingListItem.updateOne({ _id: id }, update);
    revalidatePath('/shopping-list');
    return { ok: true, found: (r.matchedCount ?? 0) > 0 };
  });
}

export async function toggleListItem(id: string, checked: boolean): Promise<{ ok: boolean; found: boolean }> {
  await assertCanWrite();
  return withRequestTenant(async () => {
    await connectDB();
    const ShoppingListItem = await currentModel(ShoppingListItemModel);
    const set: Record<string, boolean | Date> = { checked };
    if (checked) set.lastRestockedAt = new Date();
    const r = await ShoppingListItem.updateOne({ _id: id }, { $set: set });
    revalidatePath('/shopping-list');
    return { ok: true, found: (r.matchedCount ?? 0) > 0 };
  });
}

export async function deleteListItem(id: string): Promise<{ ok: boolean; found: boolean }> {
  await assertCanWrite();
  return withRequestTenant(async () => {
    await connectDB();
    const ShoppingListItem = await currentModel(ShoppingListItemModel);
    const r = await ShoppingListItem.updateOne({ _id: id }, { $set: { deletedAt: new Date() } });
    revalidatePath('/shopping-list');
    return { ok: true, found: (r.matchedCount ?? 0) > 0 };
  });
}

/** Remove everything already ticked off (soft-delete → recoverable from Trash). */
export async function clearChecked(): Promise<{ ok: boolean; cleared: number }> {
  await assertCanWrite();
  return withRequestTenant(async () => {
    await connectDB();
    const ShoppingListItem = await currentModel(ShoppingListItemModel);
    // Recurring entries must remain as bought records so the on-read pass can re-surface them.
    const r = await ShoppingListItem.updateMany({ checked: true, restockIntervalDays: { $exists: false } }, { $set: { deletedAt: new Date() } });
    revalidatePath('/shopping-list');
    return { ok: true, cleared: r.modifiedCount ?? 0 };
  });
}
