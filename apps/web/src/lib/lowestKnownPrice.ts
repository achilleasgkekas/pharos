export type ItemPriceInput = {
  currentPrice?: number | null;
  links?: { price?: number | null }[] | null;
};

/**
 * The lowest price we currently know for an item: its own `currentPrice` and every store link,
 * whichever is smallest. `null` when nothing has a usable price.
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
  let lo = (item.currentPrice ?? 0) > 0 ? (item.currentPrice as number) : Infinity;
  for (const l of item.links ?? []) {
    if (l.price && l.price > 0) {
      lo = Math.min(lo, l.price);
    }
  }
  return lo < Infinity ? lo : null;
}
