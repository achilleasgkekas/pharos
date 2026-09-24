import { iso } from '@/lib/apiList';

export type VoucherLean = {
  _id: unknown; title: string; code?: string; store?: string; discount?: string;
  expiresAt?: Date | null; used?: boolean; url?: string; notes?: string; updatedAt?: Date; deletedAt?: Date | null;
};

/** Single source of truth for the v1 Voucher JSON shape (list, POST, PATCH).
 *
 *  Lives in its own module (not route.ts) because Next's route-export validation rejects
 *  any named export from a route.ts file besides the HTTP method handlers + a small
 *  whitelist of config consts — `trim` used to be exported straight from route.ts for the
 *  sibling [id]/route.ts to import, which built fine under an older Next but broke the
 *  production build once that check tightened (mirrors the Receipt/Expense pattern:
 *  app/api/v1/receipts/serialize.ts, app/api/v1/expenses/serialize.ts). */
export function trim(v: VoucherLean) {
  return {
    id: String(v._id), title: v.title, code: v.code ?? '', store: v.store ?? '', discount: v.discount ?? '',
    expiresAt: iso(v.expiresAt), used: !!v.used, url: v.url ?? '', notes: v.notes ?? '',
    updatedAt: iso(v.updatedAt), deleted: !!v.deletedAt,
  };
}
