'use client';
import { X } from 'lucide-react';
import { useT } from '@/components/LocaleProvider';

/**
 * The filters a link brought the page in with (from Reports: a month range, a category, a store),
 * shown above the list so the user sees why it is shorter, and can drop each one.
 */
export function FilterChips({ chips }: { chips: (false | null | undefined | '' | { label: string; onClear: () => void })[] }) {
  const t = useT();
  const shown = chips.filter((c): c is { label: string; onClear: () => void } => !!c);
  if (shown.length === 0) return null;
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      {shown.map((c) => (
        <span key={c.label} className="inline-flex items-center gap-1 h-8 pl-3 pr-1 rounded-full bg-[color:var(--color-surface-2)] border border-[color:var(--color-border-light)] text-sm">
          {c.label}
          <button
            type="button"
            onClick={c.onClear}
            aria-label={t('common.removeFilter', { name: c.label })}
            title={t('common.removeFilter', { name: c.label })}
            className="grid place-items-center w-6 h-6 rounded-full text-[color:var(--color-text-faint)] hover:text-[color:var(--color-text)] hover:bg-[color:var(--color-surface-3)]"
          >
            <X size={13} />
          </button>
        </span>
      ))}
    </div>
  );
}
