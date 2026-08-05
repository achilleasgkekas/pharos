import { iso } from '@/lib/apiList';
import { giftCardBalance, giftCardSpentPct, giftCardDaysLeft } from '@/lib/giftcard';

export type GiftCardUseLean = { _id: unknown; amount: number; date?: Date | null; note?: string };
export type GiftCardLean = {
  _id: unknown; title: string; store?: string; code?: string; initialAmount: number;
  expiresAt?: Date | null; archived?: boolean; notes?: string; uses?: GiftCardUseLean[];
  updatedAt?: Date; deletedAt?: Date | null;
};

/** Single source of truth for the v1 GiftCard JSON shape (list, POST, PATCH). `balance`/
 *  `spentPct`/`daysLeft` are the same derived values the web GiftCardsClient computes
 *  client-side (lib/giftcard.ts, never stored) — computed here so API clients
 *  never have to reimplement them.
 *
 *  Lives in its own module (not route.ts) because Next's route-export validation rejects
 *  any named export from a route.ts file besides the HTTP method handlers + a small
 *  whitelist of config consts — `trim` used to be exported straight from route.ts for the
 *  sibling [id]/route.ts to import, which built fine under an older Next but broke the
 *  production build once that check tightened (mirrors the already-correct Receipt/Expense
 *  pattern: app/api/v1/receipts/serialize.ts, app/api/v1/expenses/serialize.ts). */
export function trim(g: GiftCardLean): {
  id: string; title: string; store: string; code: string; initialAmount: number;
  expiresAt: string | null; archived: boolean; notes: string; balance: number; spentPct: number;
  daysLeft: number | null;
  uses: Array<{ id: string; amount: number; date: string | null; note: string }>;
  updatedAt: string | null; deleted: boolean;
} {
  const uses = g.uses ?? [];
  return {
    id: String(g._id), title: g.title, store: g.store ?? '', code: g.code ?? '',
    initialAmount: g.initialAmount ?? 0, expiresAt: iso(g.expiresAt ?? null), archived: !!g.archived,
    notes: g.notes ?? '',
    balance: giftCardBalance(g.initialAmount ?? 0, uses),
    spentPct: giftCardSpentPct(g.initialAmount ?? 0, uses),
    daysLeft: giftCardDaysLeft(g.expiresAt ?? null),
    uses: uses.map((u) => ({ id: String(u._id), amount: u.amount, date: iso(u.date ?? null), note: u.note ?? '' })),
    updatedAt: iso(g.updatedAt), deleted: !!g.deletedAt,
  };
}
