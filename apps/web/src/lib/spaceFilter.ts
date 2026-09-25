/**
 * The "space" filter shared by every money list (Expenses/Income, Receipts, Subscriptions, Bills;
 * P34/P68, #146). One rule so the four lists cannot drift: '' = every record, NO_SPACE = records
 * with no space tag, anything else = that space exactly.
 */

/** Sentinel option for "no space set". Not a valid space name, so it never collides with one. */
export const NO_SPACE = '\x00none';

export function matchesSpace(space: string | null | undefined, filter: string): boolean {
  if (!filter) return true;
  if (filter === NO_SPACE) return !space;
  return space === filter;
}

/** The filter's options: the configured spaces, then "no space". Empty when no space is named,
 *  which is when the filter stays hidden, the same as the space field on the forms. */
export function spaceFilterOptions(spaces: string[]): string[] {
  return spaces.length ? [...spaces, NO_SPACE] : [];
}
