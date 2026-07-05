import { NextRequest, NextResponse } from 'next/server';
import { withAuth, apiError } from '@/lib/apiAuth';
import { readBody, strField } from '@/lib/apiBody';
import { bindInstallmentGroup, unbindInstallmentGroup } from '@/app/statements/actions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/v1/statements/plans/merge  { sourceKey, targetKey } → bind every charge
 *  of the `sourceKey` plan into `targetKey`, collapsing two differently-worded plans
 *  ("QUEST ONLINE" vs "QUEST ONLINE KALLITHEA") into one payoff. Wraps the proven web
 *  `bindInstallmentGroup` action. Keys come from GET /statements/plans (`plan.key`). */
export async function POST(req: NextRequest) {
  return withAuth(req, async () => {
    const b = await readBody(req);
    const sourceKey = strField(b, 'sourceKey', '', true);
    const targetKey = strField(b, 'targetKey', '', true);
    if (!sourceKey || !targetKey) return apiError('sourceKey and targetKey required');
    const r = await bindInstallmentGroup(sourceKey, targetKey);
    if (!r.ok) return apiError(r.error || 'merge failed');
    return NextResponse.json({ ok: true, moved: r.moved ?? 0 });
  });
}

/** DELETE /api/v1/statements/plans/merge  { key } → undo a merge: clear the manual
 *  planKey on every charge bound to `key`, splitting them back into their own plans.
 *  Wraps `unbindInstallmentGroup`. */
export async function DELETE(req: NextRequest) {
  return withAuth(req, async () => {
    const b = await readBody(req);
    const key = strField(b, 'key', '', true);
    if (!key) return apiError('key required');
    const r = await unbindInstallmentGroup(key);
    return NextResponse.json({ ok: r.ok, moved: r.moved ?? 0 });
  });
}
