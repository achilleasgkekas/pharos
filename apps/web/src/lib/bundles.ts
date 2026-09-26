// P39 — pure, DB-free helpers for item bundles ("builds"): a named project such as a PC
// build or a rack upgrade that several items are parts of, with the cost rolled up.
//
// A bundle is ONE free-string field on the item, not its own collection: the backlog's
// builder default is a tag-like picker plus a read-only roll-up, no new CRUD screen. So a
// bundle exists exactly while some item names it, and renaming one is editing its parts.
// Distinct from `tags` (many per item, no money side) and from `location` (where a thing
// sits, not what it is for). Everything below is DERIVED from the parts, so the filter's
// summary card and the item's "part of" line cannot disagree.

/** Longest bundle name we store. A name, not a note. */
export const MAX_BUNDLE_LENGTH = 80;

/**
 * Clamp a typed bundle name to something storable. Blank, whitespace or a non-string means
 * "not part of a bundle" (''), so the absence round-trips through the form. Inner runs of
 * whitespace collapse, so "Battle  Station" and "Battle Station" do not become two builds.
 */
export function normalizeBundle(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.replace(/\s+/g, ' ').trim().slice(0, MAX_BUNDLE_LENGTH);
}

/** Statuses where the money is already spent (or committed): the part counts as invested. */
const SPENT_STATUSES = ['ordered', 'received', 'installed', 'sold', 'broken'];
/** Statuses still on the wishlist: the part's price is what is left to buy. `deferred` is
 *  left out of that figure on purpose, like the Shopping budget does: a parked part is not
 *  a cost you are about to pay. */
const TO_BUY_STATUSES = ['researching', 'decided'];

export type BundlePart = {
  bundle?: string | null;
  status?: string | null;
  currentPrice?: number | null;
  purchasedPrice?: number | null;
};

export type BundleSummary = {
  name: string;
  /** Every item that names the bundle, whatever its status. */
  parts: number;
  /** Σ what the bought parts cost: the purchase price, or the asking price when none was typed. */
  invested: number;
  /** Σ asking price of the parts still being researched or decided on. */
  toBuy: number;
  /** Parts per stage, for the "3 planned · 1 ordered · 4 installed" line. */
  planned: number;
  ordered: number;
  received: number;
  installed: number;
};

const money = (n: number) => Math.round(n * 100) / 100;
const positive = (v: number | null | undefined) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);

/**
 * Roll every bundle up from its parts. Items with no bundle are skipped. All prices are in
 * the deployment's base currency already (see the P9 note on the Item model), so they sum
 * as they are. Sorted by name so the filter list and the summary line up.
 */
export function summarizeBundles(items: BundlePart[], compare: (a: string, b: string) => number = (a, b) => a.localeCompare(b)): BundleSummary[] {
  const byName = new Map<string, BundleSummary>();
  for (const it of items) {
    const name = normalizeBundle(it.bundle);
    if (!name) continue;
    let s = byName.get(name);
    if (!s) {
      s = { name, parts: 0, invested: 0, toBuy: 0, planned: 0, ordered: 0, received: 0, installed: 0 };
      byName.set(name, s);
    }
    const status = String(it.status ?? '');
    s.parts += 1;
    if (SPENT_STATUSES.includes(status)) {
      s.invested += positive(it.purchasedPrice) || positive(it.currentPrice);
    } else if (TO_BUY_STATUSES.includes(status)) {
      s.toBuy += positive(it.currentPrice);
    }
    if (status === 'researching' || status === 'decided' || status === 'deferred') s.planned += 1;
    else if (status === 'ordered') s.ordered += 1;
    else if (status === 'received') s.received += 1;
    else if (status === 'installed') s.installed += 1;
  }
  return [...byName.values()]
    .map((s) => ({ ...s, invested: money(s.invested), toBuy: money(s.toBuy) }))
    .sort((a, b) => compare(a.name, b.name));
}
