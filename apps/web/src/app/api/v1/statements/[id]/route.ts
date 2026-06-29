import { NextRequest, NextResponse } from 'next/server';
import { withAuth, apiError } from '@/lib/apiAuth';
import { iso } from '@/lib/apiList';
import { connectDB } from '@/lib/db';
import { Statement } from '@/models/Statement';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type TxLean = {
  _id: unknown;
  date?: Date;
  description?: string;
  amount?: number;
  category?: string;
  installmentInfo?: { currentInstallment?: number; totalInstallments?: number } | null;
};
type StatementLean = {
  _id: unknown;
  card: string;
  last4?: string;
  period: string;
  statementDate?: Date;
  dueDate?: Date | null;
  totalAmount?: number;
  minimumPayment?: number;
  paidAmount?: number;
  currency?: string;
  transactions?: TxLean[];
};

/** GET /api/v1/statements/:id — one statement with its transactions (+ per-charge installment info). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(req, async () => {
    const { id } = await params;
    if (!/^[a-f0-9]{24}$/i.test(id)) return apiError('bad id');
    await connectDB();
    const s = (await Statement.findById(id).lean()) as StatementLean | null;
    if (!s) return apiError('not found', 404);

    const transactions = (s.transactions ?? []).map((t) => ({
      id: String(t._id),
      date: iso(t.date),
      description: t.description ?? '',
      amount: t.amount ?? 0,
      category: t.category ?? 'uncategorized',
      installment:
        t.installmentInfo && t.installmentInfo.totalInstallments
          ? { current: t.installmentInfo.currentInstallment ?? 0, total: t.installmentInfo.totalInstallments }
          : null,
    }));
    // Largest charges first; installment plans surface near the top this way.
    transactions.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));

    return NextResponse.json({
      statement: {
        id: String(s._id),
        card: s.card,
        last4: s.last4 ?? '',
        period: s.period,
        statementDate: iso(s.statementDate),
        dueDate: iso(s.dueDate),
        totalAmount: s.totalAmount ?? 0,
        minimumPayment: s.minimumPayment ?? 0,
        paidAmount: s.paidAmount ?? 0,
        currency: s.currency ?? 'EUR',
      },
      transactions,
    });
  });
}
