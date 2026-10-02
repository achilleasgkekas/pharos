'use client';
// How a money category looks everywhere: the group's icon and colour plus the category's
// name in the app language, and a grouped picker for forms. See lib/categories.
import {
  Home,
  Zap,
  UtensilsCrossed,
  Car,
  HeartPulse,
  PartyPopper,
  ShoppingBag,
  Repeat,
  Landmark,
  CircleDashed,
  type LucideIcon,
} from 'lucide-react';
import { useT } from '@/components/LocaleProvider';
import { canonicalCategory, categoryGroup, categoryGroupLabel, categoryLabel, groupCategories } from '@/lib/categories';
import { cn } from '@/components/ui/cn';

const ICONS: Record<string, LucideIcon> = { Home, Zap, UtensilsCrossed, Car, HeartPulse, PartyPopper, ShoppingBag, Repeat, Landmark, CircleDashed };

export function useCategoryLabel() {
  const t = useT();
  return (value: string | null | undefined) => categoryLabel(t, value);
}

export function CategoryIcon({ category, size = 14, className }: { category: string | null | undefined; size?: number; className?: string }) {
  const g = categoryGroup(category);
  const Icon = ICONS[g.icon] ?? CircleDashed;
  return <Icon size={size} className={cn('shrink-0', className)} style={{ color: g.color }} aria-hidden />;
}

/** Icon + name, for lists and detail lines. `plain` drops the tinted pill. */
export function CategoryBadge({ category, plain = false, className }: { category: string | null | undefined; plain?: boolean; className?: string }) {
  const t = useT();
  const g = categoryGroup(category);
  return (
    <span
      className={cn('inline-flex min-w-0 items-center gap-1', !plain && 'rounded-md px-1.5 py-0.5', className)}
      style={plain ? undefined : { background: `color-mix(in srgb, ${g.color} 13%, transparent)` }}
      title={`${categoryGroupLabel(t, g.key)} › ${categoryLabel(t, category)}`}
    >
      <CategoryIcon category={category} size={12} />
      <span className="truncate">{categoryLabel(t, category)}</span>
    </span>
  );
}

/** <optgroup>s for a native <select>: one per group, names translated. A current value
 *  that is not in the list is kept as an option so editing never drops it. */
export function CategoryOptions({ categories, current }: { categories: readonly string[]; current?: string }) {
  const t = useT();
  const list = current && !categories.map(canonicalCategory).includes(canonicalCategory(current)) ? [...categories, current] : categories;
  return (
    <>
      {groupCategories(list).map(({ group, categories: cats }) => (
        <optgroup key={group.key} label={categoryGroupLabel(t, group.key)}>
          {cats.map((c) => (
            <option key={c} value={c}>
              {categoryLabel(t, c)}
            </option>
          ))}
        </optgroup>
      ))}
    </>
  );
}

/** Option labels for a SearchableSelect ("Food › Groceries"), keyed by category. */
export function useCategoryOptionLabels(categories: readonly string[]): Record<string, string> {
  const t = useT();
  return Object.fromEntries(categories.map((c) => [c, `${categoryGroupLabel(t, categoryGroup(c).key)} › ${categoryLabel(t, c)}`]));
}
