'use client';
import { useState } from 'react';
import { LayoutGrid, List as ListIcon, Plus, SlidersHorizontal } from 'lucide-react';
import { useT } from '@/components/LocaleProvider';
import { Button } from './Button';
import { cn } from './cn';

/**
 * The one page layout every list page shares (#326), taken from Inventory so buttons, filters
 * and the space picker sit in the same place on every page:
 *
 *   Title  count · subtitle                 [stats] [actions…] [grid|list] [+ New]
 *   ───────────────────────────────────────────────────────────────────────────────
 *   [filters sidebar]   content
 */

export const PAGE_MAIN = 'max-w-[1400px] mx-auto px-4 py-6 pb-24';

export function PageHeader({
  title,
  icon,
  count,
  subtitle,
  children,
}: {
  title: React.ReactNode;
  icon?: React.ReactNode;
  /** Short mono text next to the title: "12 items", "3 open". */
  count?: React.ReactNode;
  /** One line under the title, for pages that need to explain themselves. */
  subtitle?: React.ReactNode;
  /** Right side, in this order: stats, HeaderButtons, ViewToggle, PrimaryAction. */
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-6 pb-4 border-b border-[color:var(--color-border)]">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-baseline gap-3 flex-wrap">
            <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2" style={{ fontFamily: 'var(--font-display)' }}>
              {icon && <span className="text-[color:var(--color-accent)] shrink-0 self-center">{icon}</span>}
              {title}
            </h1>
            {count != null && count !== '' && (
              <span className="text-xs text-[color:var(--color-text-faint)] tracking-[0.1em]" style={{ fontFamily: 'var(--font-mono)' }}>
                {count}
              </span>
            )}
          </div>
          {subtitle && <p className="text-xs text-[color:var(--color-text-dim)] mt-1 max-w-2xl">{subtitle}</p>}
        </div>
        {children && (
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap" style={{ fontFamily: 'var(--font-mono)' }}>
            {children}
          </div>
        )}
      </div>
    </div>
  );
}

const TONE: Record<string, string> = {
  default: 'border-[color:var(--color-border)] text-[color:var(--color-text-dim)] hover:text-[color:var(--color-accent)] hover:border-[color:var(--color-accent)]',
  accent: 'border-[color:var(--color-accent)] text-[color:var(--color-accent)] hover:opacity-80',
  cyan: 'border-[color:var(--color-cyan)] text-[color:var(--color-cyan)] hover:opacity-80',
  purple: 'border-[color:var(--color-purple)] text-[color:var(--color-purple)] hover:opacity-80',
  gold: 'border-[color:var(--color-gold)] text-[color:var(--color-gold)] hover:opacity-80',
};

/** A secondary header action (Select, Duplicates, Import CSV…): the outlined Inventory style. */
export function HeaderButton({
  icon,
  children,
  tone = 'default',
  className,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { icon?: React.ReactNode; tone?: keyof typeof TONE }) {
  return (
    <button
      type="button"
      {...rest}
      className={cn(
        'flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap bg-[color:var(--color-surface-2)] border transition-colors disabled:opacity-50',
        TONE[tone],
        className
      )}
    >
      {icon}
      {children}
    </button>
  );
}

/** A figure shown on the right of the header ("est. cost €767"). */
export function HeaderStat({ label, value, color = 'var(--color-cyan)' }: { label: React.ReactNode; value: React.ReactNode; color?: string }) {
  return (
    <span className="text-xs text-[color:var(--color-text-dim)] whitespace-nowrap">
      {label} <span className="font-semibold" style={{ color }}>{value}</span>
    </span>
  );
}

/** Grid / list layout switch. */
export function ViewToggle<V extends string = 'grid' | 'list'>({
  value,
  onChange,
  options,
}: {
  value: V;
  onChange: (v: V) => void;
  options?: { value: V; icon: React.ReactNode; title?: string }[];
}) {
  const t = useT();
  const opts =
    options ??
    ([
      { value: 'grid', icon: <LayoutGrid size={15} />, title: t('v.grid') },
      { value: 'list', icon: <ListIcon size={15} />, title: t('v.list') },
    ] as { value: V; icon: React.ReactNode; title?: string }[]);
  return (
    <div className="flex bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] rounded-lg p-0.5">
      {opts.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          title={o.title}
          aria-pressed={value === o.value}
          className={cn(
            'px-2.5 py-1.5 rounded-md transition-colors',
            value === o.value ? 'bg-[color:var(--color-accent)] text-black' : 'text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)]'
          )}
        >
          {o.icon}
        </button>
      ))}
    </div>
  );
}

/** The page's main action, always last on the right: "+ New". */
export function PrimaryAction({ onClick, children, icon, disabled }: { onClick: () => void; children?: React.ReactNode; icon?: React.ReactNode; disabled?: boolean }) {
  const t = useT();
  return (
    <Button variant="primary" onClick={onClick} disabled={disabled}>
      {icon ?? <Plus size={16} strokeWidth={2.5} />} {children ?? t('common.new')}
    </Button>
  );
}

/**
 * Filters in a left sidebar on desktop and a toggle-open drawer on phones, with the content
 * beside them. `filters` is the same element for both, so the two can never disagree.
 */
export function FilterLayout({ filters, active, children }: { filters: React.ReactNode; active?: boolean; children: React.ReactNode }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <div className="flex gap-6 items-start">
      <aside className="hidden lg:block w-56 shrink-0 sticky top-4 self-start">{filters}</aside>
      <div className="flex-1 min-w-0">
        <div className="lg:hidden mb-4">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] text-[color:var(--color-text-dim)]"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            <SlidersHorizontal size={14} /> {t('ex.filters')} {active && <span className="text-[color:var(--color-accent)]">•</span>}
          </button>
          {open && <div className="mt-3 p-3 rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)]">{filters}</div>}
        </div>
        {children}
      </div>
    </div>
  );
}

/** A labelled block inside the filter sidebar. */
export function FilterSection({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] text-[color:var(--color-text-faint)] uppercase tracking-[0.12em] mb-1.5" style={{ fontFamily: 'var(--font-mono)' }}>
        {label}
      </p>
      {children}
    </div>
  );
}

/** A vertical single-choice list (STATUS: All / Open / Paid…), Inventory style. */
export function FilterOptions<V extends string>({ value, onChange, options }: { value: V; onChange: (v: V) => void; options: { value: V; label: React.ReactNode }[] }) {
  return (
    <div className="flex flex-col gap-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={cn(
            'text-left px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-[0.06em] transition-all',
            value === o.value
              ? 'bg-[color:var(--color-accent)] text-black'
              : 'text-[color:var(--color-text-dim)] hover:bg-[color:var(--color-surface-2)] hover:text-[color:var(--color-text)]'
          )}
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
