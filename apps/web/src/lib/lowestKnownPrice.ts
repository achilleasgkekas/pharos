export type ItemPriceInput = {
  currentPrice?: number | null;
  links?: { price?: number | null }[] | null;
};

/**
 * The lowest price we currently know for an item: the cheapest priced store link, or, when no
 * link carries a price, the item's own `currentPrice`. `null` when nothing has a usable price.
 *
 * Links win outright rather than competing with `currentPrice` (#212). That is the rule the
 * item form already applies when it saves (`items/actions.ts`: once links carry prices the
 * headline price is derived from them, and the manual field is only a fallback for link-less
 * items) and the one the card's headline price shows. Taking the minimum of both let a stale
 * hand-typed estimate, say 50 against a real best link of 80, keep an item "at target" long
 * after no shop sold it at that price.
 *
 * It lives here, alone, because it used to live in THREE places — the "deal" badge in the items
 * list, the in-app bell (`notifications/actions.ts`) and the outbound push (`settings/actions.ts`)
 * each carried their own copy of the same loop. Two pull requests in a row then changed one copy
 * each (#206, #216), which is how the badge and the alert start disagreeing about whether
 * something is a deal. This codebase already states that rule elsewhere — the bell and the push
 * read the same collector so they cannot contradict each other — and this is that rule applied
 * to price (#254).
 *
 * Takes the minimal shape rather than a document, because the three callers hold three different
 * types and none of them should have to widen to share an answer.
 */
export function lowestKnownPrice(item: ItemPriceInput): number | null {
  let lo = Infinity;
  for (const l of item.links ?? []) {
    if (l.price && l.price > 0) {
      lo = Math.min(lo, l.price);
    }
  }
  if (lo < Infinity) return lo;
  return (item.currentPrice ?? 0) > 0 ? (item.currentPrice as number) : null;
}
