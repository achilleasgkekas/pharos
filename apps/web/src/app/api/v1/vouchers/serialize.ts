import { iso } from '@/lib/apiList';

export type VoucherLean = {
  _id: unknown; title: string; code?: string; store?: string; discount?: string;
  expiresAt?: Date | null; used?: boolean; url?: string; notes?: string; updatedAt?: Date; deletedAt?: Date | null;
};

/** Single source of truth for the v1 Voucher JSON shape (list, POST, PATCH).
 *
 *  Lives in its own module (not route.ts) — see giftcards/serialize.ts's doc comment for why. */
export function trim(v: VoucherLean) {
  return {
    id: String(v._id), title: v.title, code: v.code ?? '', store: v.store ?? '', discount: v.discount ?? '',
    expiresAt: iso(v.expiresAt), used: !!v.used, url: v.url ?? '', notes: v.notes ?? '',
    updatedAt: iso(v.updatedAt), deleted: !!v.deletedAt,
  };
}
