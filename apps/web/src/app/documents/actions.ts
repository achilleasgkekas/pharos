'use server';
import { connectDB } from '@/lib/db';
import { Document as DocumentModel } from '@/models/Document';
import { withRequestTenant } from '@/lib/tenancy/request';
import { currentModel } from '@/lib/tenancy/connection';
import { safeDateOrNull } from '@/lib/dates';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { assertCanWrite } from '@/lib/auth';

// P42 — CRUD for personal documents with an expiry date. Deterministic, no AI. Status
// (expired / expiring soon / ok) is derived on read (lib/documentExpiry.ts), never stored.

const DocumentFormSchema = z.object({
  title: z.string().min(1, 'Title required'),
  type: z.string().default(''),
  holder: z.string().default(''),
  number: z.string().default(''),
  issuedAt: z.string().default(''),
  expiryDate: z.string().min(1, 'Expiry date required'),
  notes: z.string().default(''),
});

function fields(raw: z.infer<typeof DocumentFormSchema>) {
  return {
    title: raw.title.trim(),
    type: raw.type.trim(),
    holder: raw.holder.trim(),
    number: raw.number.trim(),
    issuedAt: safeDateOrNull(raw.issuedAt),
    notes: raw.notes.trim(),
  };
}

export async function createDocument(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  await assertCanWrite();
  const parsed = DocumentFormSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message || 'Invalid data' };
  const expiry = safeDateOrNull(parsed.data.expiryDate);
  if (!expiry) return { ok: false, error: 'Invalid expiry date' };
  return withRequestTenant(async () => {
    await connectDB();
    const Document = await currentModel(DocumentModel);
    await Document.create({ ...fields(parsed.data), expiryDate: expiry, archived: false });
    revalidatePath('/documents');
    return { ok: true };
  });
}

export async function updateDocument(id: string, formData: FormData): Promise<{ ok: boolean; error?: string }> {
  await assertCanWrite();
  const parsed = DocumentFormSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message || 'Invalid data' };
  const expiry = safeDateOrNull(parsed.data.expiryDate);
  if (!expiry) return { ok: false, error: 'Invalid expiry date' };
  return withRequestTenant(async () => {
    await connectDB();
    const Document = await currentModel(DocumentModel);
    const res = await Document.updateOne({ _id: id }, { $set: { ...fields(parsed.data), expiryDate: expiry } });
    if (!res.matchedCount) return { ok: false, error: 'Document not found' };
    revalidatePath('/documents');
    return { ok: true };
  });
}

export async function setDocumentArchived(id: string, archived: boolean): Promise<{ ok: boolean }> {
  await assertCanWrite();
  return withRequestTenant(async () => {
    await connectDB();
    const Document = await currentModel(DocumentModel);
    await Document.updateOne({ _id: id }, { $set: { archived: !!archived } });
    revalidatePath('/documents');
    return { ok: true };
  });
}

export async function deleteDocument(id: string): Promise<{ ok: boolean }> {
  await assertCanWrite();
  return withRequestTenant(async () => {
    await connectDB();
    const Document = await currentModel(DocumentModel);
    // Soft delete → Trash (Settings → Storage & data), same as the other record models.
    await Document.updateOne({ _id: id }, { $set: { deletedAt: new Date() } });
    revalidatePath('/documents');
    return { ok: true };
  });
}
