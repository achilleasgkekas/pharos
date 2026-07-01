import { NextRequest, NextResponse } from 'next/server';
import { withAuth, apiError } from '@/lib/apiAuth';
import { isObjectId } from '@/lib/apiBody';
import { aiFillSpecs, aiFillInfo } from '@/app/items/actions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/v1/items/:id/ai-fill  body { mode: 'specs' | 'info' }
 *  → reads the item's links (or top web-search hits) and fills specs ('specs')
 *    or specs+category+tags ('info', additive). Wraps the proven web
 *    `aiFillSpecs` / `aiFillInfo` actions; both are gated on the `itemsImport`
 *    AI feature and return a friendly error when it is off.
 *  Returns { ok, mode, specs?, filled?, error? } (no item — the client re-fetches
 *  GET /items/:id to refresh the detail in its own trimmed shape). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(req, async () => {
    const { id } = await params;
    if (!isObjectId(id)) return apiError('bad id');

    let mode: 'specs' | 'info' = 'specs';
    try {
      const body = (await req.json()) as { mode?: unknown };
      if (body?.mode === 'info') mode = 'info';
    } catch {
      // empty body → default 'specs'
    }

    if (mode === 'info') {
      const r = await aiFillInfo(id);
      if (!r.ok) return apiError(r.error || 'AI fill failed', 400);
      return NextResponse.json({ ok: true, mode, filled: r.filled });
    }
    const r = await aiFillSpecs(id);
    if (!r.ok) return apiError(r.error || 'AI specs failed', 400);
    return NextResponse.json({ ok: true, mode, specs: r.specs });
  });
}
