import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/apiAuth';
import { connectDB } from '@/lib/db';
import { Statement } from '@/models/Statement';
import { getAppSettings } from '@/lib/appSettings';
import { computeInstallmentPlans } from '@/lib/installments';
import type { SerializedStatement } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/v1/statements/plans → all installment plans across every statement,
 *  grouped cross-statement (same signature → one plan). Mirror of the web
 *  InstallmentOverview. Active plans first (by soonest payoff), then done.
 *  Static route → takes priority over the sibling [id] dynamic segment. */
export async function GET(req: NextRequest) {
  return withAuth(req, async () => {
    await connectDB();
    const [docs, settings] = await Promise.all([
      Statement.find().sort({ period: -1, card: 1 }).lean(),
      getAppSettings(),
    ]);
    const statements = JSON.parse(JSON.stringify(docs)) as SerializedStatement[];
    const plans = computeInstallmentPlans(statements).map((p) => ({
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
    }));
    // Active before done; computeInstallmentPlans already sorts active by soonest payoff.
    plans.sort((a, b) => (a.done === b.done ? 0 : a.done ? 1 : -1));
    return NextResponse.json({ currency: settings.currency || 'EUR', plans });
  });
}
