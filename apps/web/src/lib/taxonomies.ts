// User-editable dropdown lists (categories). Defaults here; overrides live in
// AppConfig.lists and are resolved by getAppSettings(). Pure/isomorphic.

import { ALL_CATEGORIES, CATEGORY_GROUPS, withCustomCategories } from './categories';

// Money categories come from the shared grouped list (lib/categories). A stored list no longer
// replaces it: its own additions are kept after the built-in ones.
export const DEFAULT_EXPENSE_CATEGORIES = ALL_CATEGORIES;
export const DEFAULT_ITEM_CATEGORIES = ['network', 'storage', 'compute', 'audio', 'video', 'mobile', 'peripheral', 'consumable', 'other'];
export const DEFAULT_SUBSCRIPTION_CATEGORIES = [...(CATEGORY_GROUPS.find((g) => g.key === 'subscriptions')?.categories ?? []), 'other'];

export type TaxonomyKey = 'expenseCategories' | 'itemCategories' | 'subscriptionCategories';

export const TAXONOMY_META: { key: TaxonomyKey; label: string; where: string; default: string[] }[] = [
  { key: 'expenseCategories', label: 'Expense / income categories', where: 'Expenses & Income', default: DEFAULT_EXPENSE_CATEGORIES },
  { key: 'itemCategories', label: 'Item categories', where: 'Inventory & Shopping', default: DEFAULT_ITEM_CATEGORIES },
  { key: 'subscriptionCategories', label: 'Subscription categories', where: 'Subscriptions', default: DEFAULT_SUBSCRIPTION_CATEGORIES },
];

/** Clean a user-entered list: trim, lowercase, dedupe, drop empties, keep 'other' last. */
export function normalizeList(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    const v = String(raw || '').trim().toLowerCase().replace(/\s+/g, '-').slice(0, 30);
    if (v && !seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  if (!out.includes('other')) out.push('other');
  return out;
}

/** Resolve a taxonomy from a stored overrides map (falls back to the default). */
export function resolveTaxonomy(key: TaxonomyKey, overrides: Record<string, unknown> | undefined, fallback: string[]): string[] {
  const v = overrides?.[key];
  const stored = Array.isArray(v) && v.length ? v.map(String) : [];
  // Money categories: the shared list always, plus the user's own additions.
  if (key === 'expenseCategories' || key === 'subscriptionCategories') return withCustomCategories(stored, fallback);
  return stored.length ? stored : fallback;
}

// ── Spaces / ledgers (P34) ────────────────────────────────────────────────
// A per-property / per-context ledger tag (for example, "Home" or "Work")
// so money data can be split by space. UNLIKE the category taxonomies above,
// spaces default to EMPTY (the feature stays dormant until the user names a
// space), keep their original casing, and never force an
// "other" bucket. Empty space = "unassigned / all".
export const DEFAULT_SPACES: string[] = [];
const MAX_SPACES = 24;

// ── Tax categories (P8) ───────────────────────────────────────────────────
// Suggested labels for the "tax category" free-text field, shown as options in a
// SearchableSelect (allowCustom) — NOT an enforced taxonomy like the categories
// above. Every country's deduction rules differ, so users can add their own label.
export const TAX_CATEGORY_PRESETS: string[] = [
  'Medical expenses',
  'Donations',
  'Mortgage interest',
  'Education and childcare',
  'Life insurance',
  'Disability expenses',
  'Professional expenses',
  'Other',
];

/** Clean a user-entered spaces list: trim, drop empties, dedupe case-insensitively
 *  (keeping the first spelling), cap length + count. Casing preserved for display. */
export function normalizeSpaces(items: unknown): string[] {
  if (!Array.isArray(items)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    const v = String(raw ?? '').trim().replace(/\s+/g, ' ').slice(0, 40);
    if (!v) continue;
    const k = v.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(v);
    if (out.length >= MAX_SPACES) break;
  }
  return out;
}
