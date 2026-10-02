// One shared set of money categories for the whole app: expenses and income, bills,
// subscriptions, receipt lines, statement transactions, budgets and category rules.
// Ten groups, each with an icon and a colour, and the categories under them. A record
// stores the category slug ("groceries"); the group is looked up. Old or differently
// spelled values ("food", "supermarket", "electric") are read as the category they mean,
// and anything unknown is shown as it is under "Other". Pure and isomorphic.
//
// Inventory item categories are a different thing (what an object is, not what money was
// spent on) and keep their own list in taxonomies.ts.

export type CategoryGroupKey =
  | 'home'
  | 'bills'
  | 'food'
  | 'transport'
  | 'health'
  | 'fun'
  | 'shopping'
  | 'subscriptions'
  | 'finance'
  | 'other';

export type CategoryGroup = {
  key: CategoryGroupKey;
  /** lucide-react icon name, resolved by components/CategoryIcon. */
  icon: string;
  /** Readable on both themes. */
  color: string;
  categories: string[];
};

export const CATEGORY_GROUPS: CategoryGroup[] = [
  { key: 'home', icon: 'Home', color: '#f59e0b', categories: ['rent', 'mortgage', 'home-maintenance', 'furniture', 'cleaning'] },
  { key: 'bills', icon: 'Zap', color: '#3b82f6', categories: ['utilities', 'electricity', 'water', 'gas', 'heating', 'telecom', 'internet', 'mobile-phone', 'building-fees'] },
  { key: 'food', icon: 'UtensilsCrossed', color: '#22c55e', categories: ['groceries', 'restaurants', 'delivery', 'coffee'] },
  { key: 'transport', icon: 'Car', color: '#06b6d4', categories: ['fuel', 'transport', 'parking', 'tolls', 'taxi', 'car-service'] },
  { key: 'health', icon: 'HeartPulse', color: '#ef4444', categories: ['health', 'doctor', 'pharmacy', 'dental', 'optician'] },
  { key: 'fun', icon: 'PartyPopper', color: '#a855f7', categories: ['entertainment', 'travel', 'hobbies', 'sport', 'events'] },
  { key: 'shopping', icon: 'ShoppingBag', color: '#ec4899', categories: ['clothes', 'electronics', 'household', 'personal-care', 'gifts', 'kids', 'pets'] },
  { key: 'subscriptions', icon: 'Repeat', color: '#8b5cf6', categories: ['subscription', 'streaming', 'cloud', 'software', 'gaming', 'news', 'fitness'] },
  { key: 'finance', icon: 'Landmark', color: '#14b8a6', categories: ['salary', 'freelance', 'bonus', 'refund', 'interest', 'investment', 'savings', 'tax', 'insurance', 'fees', 'loan', 'card-payment'] },
  { key: 'other', icon: 'CircleDashed', color: '#94a3b8', categories: ['uncategorized', 'other'] },
];

/** Every built-in category, in group order. */
export const ALL_CATEGORIES: string[] = CATEGORY_GROUPS.flatMap((g) => g.categories);

/** Categories that make sense for income. Shown first on the Income form. */
export const INCOME_CATEGORIES = ['salary', 'freelance', 'bonus', 'refund', 'interest', 'investment', 'other'];

const GROUP_OF = new Map<string, CategoryGroup>(CATEGORY_GROUPS.flatMap((g) => g.categories.map((c) => [c, g] as const)));
const BY_KEY = new Map<CategoryGroupKey, CategoryGroup>(CATEGORY_GROUPS.map((g) => [g.key, g]));

/** Other spellings people and banks use, and older values from before the shared list. */
export const CATEGORY_ALIASES: Record<string, string> = {
  food: 'groceries',
  supermarket: 'groceries',
  grocery: 'groceries',
  market: 'groceries',
  restaurant: 'restaurants',
  dining: 'restaurants',
  takeaway: 'delivery',
  cafe: 'coffee',
  electric: 'electricity',
  power: 'electricity',
  phone: 'mobile-phone',
  mobile: 'mobile-phone',
  broadband: 'internet',
  petrol: 'fuel',
  gasoline: 'fuel',
  diesel: 'fuel',
  'public-transport': 'transport',
  car: 'car-service',
  medical: 'doctor',
  medicine: 'pharmacy',
  clothing: 'clothes',
  gift: 'gifts',
  pet: 'pets',
  taxes: 'tax',
  fee: 'fees',
  bank: 'fees',
  subscriptions: 'subscription',
  music: 'streaming',
  video: 'streaming',
  gym: 'fitness',
  holiday: 'travel',
  vacation: 'travel',
  income: 'salary',
  wages: 'salary',
};

/** The category a stored value means: lowercased, aliases resolved, unknown kept as is. */
export function canonicalCategory(value: string | null | undefined): string {
  const v = String(value ?? '').trim().toLowerCase().replace(/\s+/g, '-');
  if (!v) return 'other';
  return CATEGORY_ALIASES[v] ?? v;
}

/** The group a category belongs to; unknown and custom categories go under Other. */
export function categoryGroup(value: string | null | undefined): CategoryGroup {
  return GROUP_OF.get(canonicalCategory(value)) ?? (BY_KEY.get('other') as CategoryGroup);
}

export function isBuiltInCategory(value: string): boolean {
  return GROUP_OF.has(canonicalCategory(value));
}

/** The built-in list plus a user's own additions (custom ones last, de-duplicated). */
export function withCustomCategories(stored: readonly string[] | undefined, base: readonly string[] = ALL_CATEGORIES): string[] {
  const out = [...base];
  const seen = new Set(out);
  for (const raw of stored ?? []) {
    const c = canonicalCategory(raw);
    if (c && !seen.has(c)) {
      seen.add(c);
      out.push(c);
    }
  }
  return out;
}

/** A list of categories split by group, in group order, for a grouped picker. Custom
 *  categories land under Other. Groups with nothing in the list are left out. */
export function groupCategories(list: readonly string[]): { group: CategoryGroup; categories: string[] }[] {
  const buckets = new Map<CategoryGroupKey, string[]>();
  for (const raw of list) {
    const c = canonicalCategory(raw);
    const g = categoryGroup(c).key;
    const arr = buckets.get(g) ?? [];
    if (!arr.includes(c)) arr.push(c);
    buckets.set(g, arr);
  }
  return CATEGORY_GROUPS.filter((g) => buckets.has(g.key)).map((g) => ({ group: g, categories: buckets.get(g.key)! }));
}

/** "boat-club" → "Boat club" for a category the user made up. */
const humanize = (c: string) => (c ? c.charAt(0).toUpperCase() + c.slice(1).replace(/-/g, ' ') : c);

/** The name of a category in the app language (`t` from useT or getServerT). */
export function categoryLabel(t: (key: never) => string, value: string | null | undefined): string {
  const c = canonicalCategory(value);
  const key = `cat.${c}`;
  const s = (t as (k: string) => string)(key);
  return s === key ? humanize(c) : s;
}

/** The name of a group in the app language. */
export function categoryGroupLabel(t: (key: never) => string, group: CategoryGroupKey): string {
  return (t as (k: string) => string)(`catg.${group}`);
}
