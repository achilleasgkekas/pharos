// Pure helper for global search (P22): when a query matches a product *inside*
// a receipt (a line-item name) rather than the store, surface which line item
// matched so the user understands why the receipt appeared ("where did I buy
// this?"). Kept out of the `'use server'` search-actions.ts (which can only
// export async fns) so it stays synchronous and unit-testable without a DB.

export type LineItemLike = { name?: string | null; refinedName?: string | null };

/**
 * Return the display name of the first line item whose name (or AI-normalized
 * refinedName) matches `rx`, or null if none match. refinedName is preferred
 * for display when it is the field that matched; otherwise the raw name is used.
 * `rx` must be a non-global RegExp (no lastIndex state to reset between tests).
 */
export function matchedLineItemName(
  rx: RegExp,
  lineItems?: LineItemLike[] | null,
): string | null {
  if (!lineItems || lineItems.length === 0) return null;
  for (const li of lineItems) {
    const refined = (li.refinedName || '').trim();
    const raw = (li.name || '').trim();
    if (refined && rx.test(refined)) return refined;
    if (raw && rx.test(raw)) return raw;
  }
  return null;
}
