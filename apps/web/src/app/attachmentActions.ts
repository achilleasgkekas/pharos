'use server';
// Files and links kept on a record (items, documents, bills, subscriptions, tasks, vouchers). One set of
// actions for all of them, so every detail dialog gets the same "Files & links" block.
import { revalidatePath } from 'next/cache';
import type { Model } from 'mongoose';
import { connectDB } from '@/lib/db';
import { assertCanWrite } from '@/lib/auth';
import { withRequestTenant } from '@/lib/tenancy/request';
import { currentModel } from '@/lib/tenancy/connection';
import { saveFile, deleteFile } from '@/lib/storage';
import { Item } from '@/models/Item';
import { Document } from '@/models/Document';
import { Bill } from '@/models/Bill';
import { Subscription } from '@/models/Subscription';
import { Task } from '@/models/Task';
import { Voucher } from '@/models/Voucher';
import { ATTACHMENT_KINDS, cleanAttachmentUrl, type AttachmentKind } from '@/lib/attachments';
import type { SerializedAttachment } from '@/types';

type AttachmentDoc = { attachments: Record<string, unknown>[]; markModified(p: string): void; save(): Promise<unknown> };

const MODELS: Record<AttachmentKind, { model: Model<never>; paths: string[] }> = {
  item: { model: Item as unknown as Model<never>, paths: ['/items', '/shopping'] },
  document: { model: Document as unknown as Model<never>, paths: ['/documents'] },
  bill: { model: Bill as unknown as Model<never>, paths: ['/expenses/to-pay'] },
  subscription: { model: Subscription as unknown as Model<never>, paths: ['/subscriptions'] },
  task: { model: Task as unknown as Model<never>, paths: ['/tasks'] },
  voucher: { model: Voucher as unknown as Model<never>, paths: ['/vouchers'] },
};

const FILE_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  txt: 'text/plain',
};
const MAX_FILE_BYTES = 15 * 1024 * 1024;
const MAX_ATTACHMENTS = 50;

type Result = { ok: boolean; attachments: SerializedAttachment[]; error?: string };

const serialize = (doc: AttachmentDoc): SerializedAttachment[] => JSON.parse(JSON.stringify(doc.attachments ?? []));

async function withRecord(kind: AttachmentKind, id: string, fn: (doc: AttachmentDoc) => Promise<Result>): Promise<Result> {
  if (!ATTACHMENT_KINDS.includes(kind) || typeof id !== 'string' || !/^[a-f0-9]{24}$/i.test(id)) {
    return { ok: false, attachments: [], error: 'Not found' };
  }
  return withRequestTenant(async () => {
    await connectDB();
    const M = await currentModel(MODELS[kind].model);
    const doc = (await M.findById(id)) as unknown as AttachmentDoc | null;
    if (!doc) return { ok: false, attachments: [], error: 'Not found' };
    if (!Array.isArray(doc.attachments)) doc.attachments = [];
    const r = await fn(doc);
    for (const p of MODELS[kind].paths) revalidatePath(p);
    return r;
  });
}

/** Upload one or more files onto a record. */
export async function addAttachmentFiles(kind: AttachmentKind, id: string, formData: FormData): Promise<Result> {
  await assertCanWrite();
  return withRecord(kind, id, async (doc) => {
    const files = formData.getAll('files').filter((f): f is File => f instanceof File && f.size > 0);
    if (!files.length) return { ok: false, attachments: serialize(doc), error: 'No file selected' };
    let added = 0;
    for (const file of files) {
      if (doc.attachments.length >= MAX_ATTACHMENTS) break;
      const ext = (file.name.split('.').pop() || '').toLowerCase();
      if (!FILE_MIME[ext] || file.size > MAX_FILE_BYTES) continue;
      const { relativePath } = await saveFile('equipment', Buffer.from(await file.arrayBuffer()), ext);
      doc.attachments.push({ path: relativePath, url: '', name: file.name.slice(0, 200), mimeType: FILE_MIME[ext], size: file.size, uploadedAt: new Date() });
      added++;
    }
    if (added) {
      doc.markModified('attachments');
      await doc.save();
    }
    return { ok: added > 0, attachments: serialize(doc), error: added ? undefined : 'Unsupported file type or too large (max 15MB)' };
  });
}

/** Keep a link (a manual online, a contract page) on a record. */
export async function addAttachmentLink(kind: AttachmentKind, id: string, url: string, label: string): Promise<Result> {
  await assertCanWrite();
  return withRecord(kind, id, async (doc) => {
    const clean = cleanAttachmentUrl(url);
    if (!clean) return { ok: false, attachments: serialize(doc), error: 'Enter a link that starts with http:// or https://' };
    if (doc.attachments.length >= MAX_ATTACHMENTS) return { ok: false, attachments: serialize(doc), error: 'Too many attachments' };
    if (doc.attachments.some((a) => a.url === clean)) return { ok: true, attachments: serialize(doc) };
    const name = String(label || '').trim().slice(0, 200) || new URL(clean).hostname.replace(/^www\./, '');
    doc.attachments.push({ path: '', url: clean, name, mimeType: '', size: 0, uploadedAt: new Date() });
    doc.markModified('attachments');
    await doc.save();
    return { ok: true, attachments: serialize(doc) };
  });
}

/** Remove a file (and delete it from storage) or a link. `key` is the file path or the url. */
export async function removeAttachment(kind: AttachmentKind, id: string, key: string): Promise<Result> {
  await assertCanWrite();
  return withRecord(kind, id, async (doc) => {
    const hit = doc.attachments.find((a) => (a.path && a.path === key) || (a.url && a.url === key));
    if (!hit) return { ok: false, attachments: serialize(doc) };
    doc.attachments = doc.attachments.filter((a) => a !== hit);
    doc.markModified('attachments');
    await doc.save();
    if (hit.path) await deleteFile(String(hit.path)).catch(() => {});
    return { ok: true, attachments: serialize(doc) };
  });
}
