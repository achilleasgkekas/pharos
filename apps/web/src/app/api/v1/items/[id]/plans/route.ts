import { NextRequest, NextResponse } from 'next/server';
import { withAuth, apiError } from '@/lib/apiAuth';
import { connectDB } from '@/lib/db';
import { Statement } from '@/models/Statement';
import { getAppSettings } from '@/lib/appSettings';
import { computeInstallmentPlans } from '@/lib/installments';
import type { SerializedStatement } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/v1/items/:id/plans → installment plans across all statements, each
 *  flagged `linked` if this item is already attached. Used by the mobile item
 *  detail to link/unlink a δόσεις plan to a product (mirror of the web overview).
 *  Linked plans first, then active, then by soonest payoff. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(req, async () => {
    const { id } = await params;
    if (!/^[a-f0-9]{24}$/i.test(id)) return apiError('bad id');
    await connectDB();
    const [docs, settings] = await Promise.all([
      Statement.find().sort({ period: -1, card: 1 }).lean(),
      getAppSettings(),
    ]);
    const statements = JSON.parse(JSON.stringify(docs)) as SerializedStatement[];
    const plans = computeInstallmentPlans(statements).map((p) => {
      const linked = p.itemIds.includes(id);
      return {
        signature: p.signature,
        label: p.label,
        card: p.card,
        perAmount: p.perAmount,
        totalInstallments: p.totalInstallments,
        paidInstallments: p.paidInstallments,
        remainingInstallments: p.remainingInstallments,
        remainingAmount: p.remainingAmount,
        totalAmount: p.totalAmount,
        projectedEndDate: p.projectedEndDate,
        done: p.done,
        itemCount: p.itemIds.length,
        linked,
      };
    });
    // Linked first, then keep computeInstallmentPlans' active-before-done ordering.
    plans.sort((a, b) => (a.linked === b.linked ? 0 : a.linked ? -1 : 1));
    return NextResponse.json({ currency: settings.currency || 'EUR', plans });
  });
}
