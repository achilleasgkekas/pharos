import { NextRequest, NextResponse } from 'next/server';
import { withAuth, apiError } from '@/lib/apiAuth';
import { uploadReceipt } from '@/app/receipts/actions';
import { importStatementPdf } from '@/app/statements/actions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TARGETS = ['receipt', 'statement'] as const;
type Target = (typeof TARGETS)[number];

/** POST /api/v1/share — multipart `file` + `target` (receipt | statement).
 *
 *  #123, the iPhone half. iOS Safari does not implement the Web Share Target API, so the PWA
 *  `share_target` (/capture/share) only ever appears on Android/ChromeOS. On iPhone the share sheet
 *  runs an Apple Shortcut instead, which cannot carry the browser session — so this is the same
 *  "send a file to a module" door, authenticated with the user's API token like every /api/v1 route.
 *
 *  The file is replayed into the module's OWN action (uploadReceipt / importStatementPdf): parsing,
 *  storage, quotas and tenant scoping stay where they already live. The Shortcut asks the user what
 *  the file is, so no picker screen is needed here. */
export async function POST(req: NextRequest) {
  return withAuth(req, async () => {
    if (!(req.headers.get('content-type') || '').includes('multipart/form-data')) {
      return apiError('Send multipart/form-data with fields "file" and "target"', 400);
    }
    const form = await req.formData();
    const target = String(form.get('target') || '') as Target;
    if (!TARGETS.includes(target)) return apiError('target must be "receipt" or "statement"', 400);
    const file = form.get('file');
    if (!(file instanceof File) || file.size === 0) return apiError('No file found', 400);

    const payload = new FormData();
    payload.set('file', file);
    const res = target === 'statement' ? await importStatementPdf(payload) : await uploadReceipt(payload);
    if (!res.ok) return apiError(res.error || 'Import failed', 400);
    return NextResponse.json({ data: { target, redirectTo: target === 'statement' ? '/statements' : '/receipts' } });
  });
}
