import { iso } from '@/lib/apiList';

export type SubLean = {
  _id: unknown; name: string; provider?: string; category?: string; amount?: number; currency?: string;
  origAmount?: number; fxRate?: number;
  billingCycle?: string; startDate?: Date; nextRenewal?: Date | null; active?: boolean; paymentMethod?: string;
  url?: string; notes?: string; trialEndsAt?: Date | null; firstChargeAmount?: number; updatedAt?: Date; deletedAt?: Date | null;
};

/** Single source of truth for the v1 Subscription JSON shape (list, POST, PATCH).
 *
 *  Lives in its own module (not route.ts) — see giftcards/serialize.ts's doc comment for why. */
export function trim(s: SubLean) {
  return {
    id: String(s._id),
    name: s.name,
    provider: s.provider ?? '',
    category: s.category ?? 'other',
    amount: s.amount ?? 0,
    currency: s.currency ?? 'EUR',
    // P9: `amount` is always base currency. On a foreign-currency subscription these two carry
    // the printed figure and the rate used (fxRate 0 = not foreign, or rate still unknown, in
    // which case `amount` is the printed number and NOT yet converted).
    origAmount: s.origAmount ?? 0,
    fxRate: s.fxRate ?? 0,
    billingCycle: s.billingCycle ?? 'monthly',
    startDate: iso(s.startDate),
    nextRenewal: iso(s.nextRenewal),
    active: s.active !== false,
    paymentMethod: s.paymentMethod ?? '',
    url: s.url ?? '',
    notes: s.notes ?? '',
    trialEndsAt: iso(s.trialEndsAt),
    firstChargeAmount: s.firstChargeAmount ?? 0,
    updatedAt: iso(s.updatedAt),
    deleted: !!s.deletedAt,
  };
}
