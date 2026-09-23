export type ItemPriceInput = {
  currentPrice?: number | null;
  links?: { price?: number | null }[] | null;
};

/**
 * Calculates the lowest known current price across `currentPrice` and all store links.
 * Returns `null` if no valid positive price exists.
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
