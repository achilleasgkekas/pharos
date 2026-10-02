'use server';
// Camera / file scans for Documents, Bills and Utilities. Read only: the result prefills a form
// the user confirms, and the file itself is kept with the record afterwards (Files & links).
import { assertCanWrite } from '@/lib/auth';
import { isFeatureEnabled } from '@/lib/aiFeatures.server';
import { withRequestTenant } from '@/lib/tenancy/request';
import { scanHomeFile } from '@/lib/homeScan.server';
import type { BillScan, DocumentScan, HomeScanKind, MeterScan } from '@/lib/homeScan';

const MAX_BYTES = 40 * 1024 * 1024;
const EXTS = new Set(['pdf', 'jpg', 'jpeg', 'png', 'webp', 'heic']);
const FEATURE = { document: 'documents', bill: 'bills', meter: 'meters' } as const;

export type HomeScanResult =
  | { ok: true; kind: 'document'; data: DocumentScan }
  | { ok: true; kind: 'bill'; data: BillScan }
  | { ok: true; kind: 'meter'; data: MeterScan }
  | { ok: false; error: string };

export async function scanHomeDocument(kind: HomeScanKind, formData: FormData): Promise<HomeScanResult> {
  await assertCanWrite();
  if (kind !== 'document' && kind !== 'bill' && kind !== 'meter') return { ok: false, error: 'Unknown scan' };
  return withRequestTenant(async (): Promise<HomeScanResult> => {
    if (!(await isFeatureEnabled(FEATURE[kind]))) return { ok: false, error: 'This scan (AI) is turned off. Turn it on in Settings → AI.' };
    const file = formData.get('file');
    if (!(file instanceof File) || file.size === 0) return { ok: false, error: 'No file' };
    if (file.size > MAX_BYTES) return { ok: false, error: 'File too large (max 40MB)' };
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (!EXTS.has(ext)) return { ok: false, error: 'Use a photo or a PDF' };
    try {
      const bytes = Buffer.from(await file.arrayBuffer());
      if (kind === 'document') return { ok: true, kind, data: await scanHomeFile('document', bytes, ext) };
      if (kind === 'bill') return { ok: true, kind, data: await scanHomeFile('bill', bytes, ext) };
      return { ok: true, kind: 'meter', data: await scanHomeFile('meter', bytes, ext) };
    } catch (err) {
      const msg = (err as Error).message || String(err);
      return { ok: false, error: /ECONNREFUSED|fetch failed|ENOTFOUND/i.test(msg) ? 'AI not reachable (check the AI provider)' : `AI scan failed: ${msg.slice(0, 140)}` };
    }
  });
}
