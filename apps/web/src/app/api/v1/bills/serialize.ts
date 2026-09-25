import { iso } from '@/lib/apiList';
import { billStatus, billPaidAmount, billRemaining, billPaymentState, type BillStatus, type BillPaymentState } from '@/lib/bill';

export type BillPaymentLean = { _id?: unknown; amount?: number; date?: Date | null; note?: string; expenseId?: string };

export type BillLean = {
  _id: unknown; title: string; vendor?: string; amount?: number; currency?: string;
  origAmount?: number; fxRate?: number; dueDate: Date;
  paidAt?: Date | null; payments?: BillPaymentLean[]; category?: string; cycle?: string; notes?: string; space?: string;
  archived?: boolean; linkedExpenseId?: string; updatedAt?: Date; deletedAt?: Date | null;
};

/** Single source of truth for the v1 Bill JSON shape (list, POST, PATCH). `status` is
 *  the same derived paid/overdue/due-soon/upcoming used by the web BillsClient —
 *  computed here so API clients never have to reimplement `billStatus`.
 *
 *  Lives in its own module (not route.ts) — see giftcards/serialize.ts's doc comment for why:
 *  Next's route-export validation rejects any named export from a route.ts besides the HTTP
 *  method handlers + a small config whitelist.
 *
 *  P61 added `payments`/`paidAmount`/`remaining`/`paymentState` as PURELY ADDITIVE fields.
 *  `status` deliberately keeps its four values: a client that reads it keeps working, and a
 *  half-paid bill that is late still reports `overdue` rather than hiding it behind progress. */
import { needsFxRate } from '@/lib/fx';

export function trim(b: BillLean, baseCurr: string): {
  id: string; title: string; vendor: string; amount: number; currency: string;
  origAmount: number; fxRate: number; dueDate: string | null;
  paidAt: string | null; category: string; cycle: string; notes: string; space: string; archived: boolean;
  status: BillStatus; paidAmount: number; remaining: number; paymentState: BillPaymentState;
  payments: { id: string; amount: number; date: string | null; note: string }[];
  updatedAt: string | null; deleted: boolean;
} {
  const payments = b.payments ?? [];
  return {
    id: String(b._id), title: b.title, vendor: b.vendor ?? '', amount: b.amount ?? 0,
    currency: b.currency ?? 'EUR', origAmount: b.origAmount ?? 0, fxRate: b.fxRate ?? 0,
    dueDate: iso(b.dueDate), paidAt: iso(b.paidAt ?? null), category: b.category ?? 'other',
    cycle: b.cycle ?? '', notes: b.notes ?? '', space: b.space ?? '', archived: !!b.archived,
    status: billStatus(b.dueDate, b.paidAt ?? null),
    paidAmount: billPaidAmount(payments),
    remaining: billRemaining(b.amount, payments, b.paidAt ?? null, needsFxRate(b, baseCurr)),
    paymentState: billPaymentState(b.amount, payments, b.paidAt ?? null, needsFxRate(b, baseCurr)),
    payments: payments.map((p) => ({
      id: String(p._id ?? ''), amount: Number(p.amount) || 0, date: iso(p.date ?? null), note: p.note ?? '',
    })),
    updatedAt: iso(b.updatedAt), deleted: !!b.deletedAt,
  };
}
