'use server';

import { revalidatePath } from 'next/cache';
import { connectDB } from '@/lib/db';
import { ShoppingListItem } from '@/models/ShoppingListItem';
import { parseProductPhoto, type ParsedProductPhoto } from '@/lib/ollama';
import { isFeatureEnabled } from '@/lib/aiFeatures.server';

export type SerializedListItem = {
  _id: string;
  name: string;
  quantity: string;
  category: string;
  brand: string;
  note: string;
  checked: boolean;
  aiScanned: boolean;
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
    createdAt: new Date(d.createdAt).toISOString(),
  };
}

export type ScanProductResult = { ok: true; data: ParsedProductPhoto } | { ok: false; error: string };

function aiError(err: unknown): string {
  const msg = (err as Error).message || String(err);
  return /ECONNREFUSED|fetch failed|ENOTFOUND/i.test(msg) ? 'AI not reachable (check Ollama / provider)' : `AI failed: ${msg.slice(0, 120)}`;
}

export async function getListItems(): Promise<SerializedListItem[]> {
  await connectDB();
  // Unchecked first, then newest. Checked items sink to the bottom.
  const docs = (await ShoppingListItem.find().sort({ checked: 1, createdAt: -1 }).lean()) as ListItemLean[];
  return docs.map(serialize);
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

type NewItem = { name: string; quantity?: string; category?: string; brand?: string; note?: string; aiScanned?: boolean };

export async function addListItem(data: NewItem): Promise<{ ok: boolean; error?: string }> {
  const name = (data.name || '').trim();
  if (!name) return { ok: false, error: 'Name required' };
  await connectDB();
  await ShoppingListItem.create({
    name,
    quantity: (data.quantity || '').trim(),
    category: (data.category || '').trim(),
    brand: (data.brand || '').trim(),
    note: (data.note || '').trim(),
    aiScanned: !!data.aiScanned,
    checked: false,
  });
  revalidatePath('/shopping-list');
  return { ok: true };
}

// `found` reports whether a live (non-trashed) doc matched — lets the REST layer
// return 404 instead of a silent success. The web UI ignores the return value.
export async function updateListItem(id: string, data: Partial<NewItem>): Promise<{ ok: boolean; found: boolean }> {
  await connectDB();
  const set: Record<string, string> = {};
  for (const k of ['name', 'quantity', 'category', 'brand', 'note'] as const) {
    if (data[k] !== undefined) set[k] = String(data[k]).trim();
  }
  const r = await ShoppingListItem.updateOne({ _id: id }, { $set: set });
  revalidatePath('/shopping-list');
  return { ok: true, found: (r.matchedCount ?? 0) > 0 };
}

export async function toggleListItem(id: string, checked: boolean): Promise<{ ok: boolean; found: boolean }> {
  await connectDB();
  const r = await ShoppingListItem.updateOne({ _id: id }, { $set: { checked } });
  revalidatePath('/shopping-list');
  return { ok: true, found: (r.matchedCount ?? 0) > 0 };
}

export async function deleteListItem(id: string): Promise<{ ok: boolean; found: boolean }> {
  await connectDB();
  const r = await ShoppingListItem.updateOne({ _id: id }, { $set: { deletedAt: new Date() } });
  revalidatePath('/shopping-list');
  return { ok: true, found: (r.matchedCount ?? 0) > 0 };
}

/** Remove everything already ticked off (soft-delete → recoverable from Trash). */
export async function clearChecked(): Promise<{ ok: boolean; cleared: number }> {
  await connectDB();
  const r = await ShoppingListItem.updateMany({ checked: true }, { $set: { deletedAt: new Date() } });
  revalidatePath('/shopping-list');
  return { ok: true, cleared: r.modifiedCount ?? 0 };
}
