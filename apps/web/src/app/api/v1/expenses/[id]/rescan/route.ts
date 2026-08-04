import { NextRequest, NextResponse } from 'next/server';
import { withAuth, apiError } from '@/lib/apiAuth';
import { isObjectId, readBody } from '@/lib/apiBody';
import { connectDB } from '@/lib/db';
import { Expense as ExpenseModel } from '@/models/Expense';
import { currentModel } from '@/lib/tenancy/connection';
import { rescanExpense } from '@/app/expenses/actions';
import { trimExpense, type ExpenseLean } from '../../serialize';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/expenses/:id/rescan  { ocr?: boolean }
 * Re-runs the AI parse on the expense's stored bill/payslip (mirror of the web `rescanExpense`).
 * `ocr:true` forces the OCR path; otherwise embedded PDF text / vision model.
 * Returns the SAME shape as GET /api/v1/expenses (single `expense`) so the mobile
 * detail can re-prefill in place. The re-scanned record is left unverified.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(req, async () => {
    const { id } = await params;
    if (!isObjectId(id)) return apiError('bad id');
    const b = await readBody(req);
    const useOcr = b.ocr === true;

    const result = await rescanExpense(id, useOcr);
    if (!result.ok) {
      const msg = result.error || 'rescan failed';
      return apiError(msg, /no file|not found|missing/i.test(msg) ? 404 : 500);
    }

    // Re-read with the exact GET serializer so the mobile re-prefill matches the list shape.
    await connectDB();
    const Expense = await currentModel(ExpenseModel);
    const doc = await Expense.findById(id).select('-rawAiResponse').lean();
    if (!doc) return apiError('not found', 404);
    return NextResponse.json({ expense: trimExpense(doc as ExpenseLean) });
  });
}
