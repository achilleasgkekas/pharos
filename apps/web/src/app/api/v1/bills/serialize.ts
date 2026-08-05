import { iso } from '@/lib/apiList';
import { billStatus, type BillStatus } from '@/lib/bill';

export type BillLean = {
  _id: unknown; title: string; vendor?: string; amount?: number; currency?: string;
  origAmount?: number; fxRate?: number; dueDate: Date;
  paidAt?: Date | null; category?: string; cycle?: string; notes?: string;
  archived?: boolean; linkedExpenseId?: string; updatedAt?: Date; deletedAt?: Date | null;
};

/** Single source of truth for the v1 Bill JSON shape (list, POST, PATCH). `status` is
 *  the same derived paid/overdue/due-soon/upcoming used by the web BillsClient —
 *  computed here so API clients never have to reimplement `billStatus`.
 *
 *  Lives in its own module (not route.ts) — see giftcards/serialize.ts's doc comment for why:
 *  Next's route-export validation rejects any named export from a route.ts besides the HTTP
 *  method handlers + a small config whitelist. */
export function trim(b: BillLean): {
  id: string; title: string; vendor: string; amount: number; currency: string;
  origAmount: number; fxRate: number; dueDate: string | null;
  paidAt: string | null; category: string; cycle: string; notes: string; archived: boolean;
  status: BillStatus; updatedAt: string | null; deleted: boolean;
} {
  return {
    id: String(b._id), title: b.title, vendor: b.vendor ?? '', amount: b.amount ?? 0,
    currency: b.currency ?? 'EUR', origAmount: b.origAmount ?? 0, fxRate: b.fxRate ?? 0,
    dueDate: iso(b.dueDate), paidAt: iso(b.paidAt ?? null), category: b.category ?? 'other',
    cycle: b.cycle ?? '', notes: b.notes ?? '', archived: !!b.archived,
    status: billStatus(b.dueDate, b.paidAt ?? null),
    updatedAt: iso(b.updatedAt), deleted: !!b.deletedAt,
  };
}
