// User-editable dropdown lists (categories). Defaults here; overrides live in
// AppConfig.lists and are resolved by getAppSettings(). Pure/isomorphic.

export const DEFAULT_EXPENSE_CATEGORIES = ['rent', 'utilities', 'fuel', 'salary', 'insurance', 'telecom', 'groceries', 'transport', 'health', 'tax', 'subscription', 'other'];
export const DEFAULT_ITEM_CATEGORIES = ['network', 'storage', 'compute', 'audio', 'video', 'mobile', 'peripheral', 'consumable', 'other'];
export const DEFAULT_SUBSCRIPTION_CATEGORIES = ['streaming', 'cloud', 'software', 'gaming', 'news', 'fitness', 'other'];

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
  if (Array.isArray(v) && v.length) return v.map(String);
  return fallback;
}

// ── Spaces / ledgers (P34) ────────────────────────────────────────────────
// A per-property / per-context ledger tag (e.g. "Σπίτι", "Εξοχικό", "Δουλειά")
// so money data can be split by space. UNLIKE the category taxonomies above,
// spaces default to EMPTY (the feature stays dormant until the user names a
// space), keep their original casing (Greek proper nouns), and never force an
// "other" bucket. Empty space = "unassigned / all".
export const DEFAULT_SPACES: string[] = [];
const MAX_SPACES = 24;

// ── Tax categories (P8) ───────────────────────────────────────────────────
// Suggested labels for the "tax category" free-text field, shown as options in a
// SearchableSelect (allowCustom) — NOT an enforced taxonomy like the categories
// above (every country's deduction rules differ, and this app has no per-country
// setting). GR-flavoured since that's the primary user base; free text otherwise.
export const TAX_CATEGORY_PRESETS: string[] = [
  'Ιατρικά έξοδα',
  'Δωρεές',
  'Τόκοι στεγαστικού δανείου',
  'Ενοίκιο (φοιτητές/παιδιά)',
  'Ασφάλιστρα ζωής',
  'Δαπάνες αναπηρίας',
  'Επαγγελματικά έξοδα',
  'Άλλο',
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
