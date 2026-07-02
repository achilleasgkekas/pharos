import { iso } from '@/lib/apiList';

/** Lean Expense doc shape as read from Mongo (fields the v1 surface exposes). */
export type ExpenseLean = {
  _id: unknown; kind?: string; vendor?: string; category?: string; amount?: number; currency?: string;
  date?: Date; period?: string; recurring?: boolean; recurringCycle?: string; paymentMethod?: string;
  notes?: string; filePath?: string; thumbPath?: string; verified?: boolean; updatedAt?: Date; deletedAt?: Date | null;
};

/**
 * Single source of truth for the v1 Expense JSON shape.
 * Shared by GET /api/v1/expenses (list) and POST /api/v1/expenses/:id/rescan
 * so the mobile detail can re-prefill in place from either.
 */
export function trimExpense(e: ExpenseLean) {
  return {
    id: String(e._id),
    kind: e.kind ?? 'expense',
    vendor: e.vendor ?? '',
    category: e.category ?? 'other',
    amount: e.amount ?? 0,
    currency: e.currency ?? 'EUR',
    date: iso(e.date),
    period: e.period ?? '',
    recurring: !!e.recurring,
    recurringCycle: e.recurringCycle ?? '',
    paymentMethod: e.paymentMethod ?? '',
    notes: e.notes ?? '',
    file: e.filePath || null,
    thumb: e.thumbPath || null,
    verified: !!e.verified,
    updatedAt: iso(e.updatedAt),
    deleted: !!e.deletedAt,
  };
}
