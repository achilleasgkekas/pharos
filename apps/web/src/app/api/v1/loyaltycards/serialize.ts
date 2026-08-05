import { iso } from '@/lib/apiList';

export type LoyaltyCardLean = {
  _id: unknown; title: string; store?: string; cardNumber: string; barcodeFormat?: string;
  notes?: string; archived?: boolean; updatedAt?: Date; deletedAt?: Date | null;
};

/** Single source of truth for the v1 LoyaltyCard JSON shape (list, POST, PATCH). No balance
 *  to derive (unlike GiftCard/P32) — this is just an identity card a checkout scanner reads,
 *  so the trim is a plain field mirror.
 *
 *  Lives in its own module (not route.ts) — see giftcards/serialize.ts's doc comment for why. */
export function trim(c: LoyaltyCardLean): {
  id: string; title: string; store: string; cardNumber: string; barcodeFormat: string;
  notes: string; archived: boolean; updatedAt: string | null; deleted: boolean;
} {
  return {
    id: String(c._id), title: c.title, store: c.store ?? '', cardNumber: c.cardNumber,
    barcodeFormat: c.barcodeFormat ?? 'CODE128', notes: c.notes ?? '', archived: !!c.archived,
    updatedAt: iso(c.updatedAt), deleted: !!c.deletedAt,
  };
}
