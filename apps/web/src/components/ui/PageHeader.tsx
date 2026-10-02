'use client';
import { useState } from 'react';
import { LayoutGrid, List as ListIcon, Plus, SlidersHorizontal } from 'lucide-react';
import { useT } from '@/components/LocaleProvider';
import { Button } from './Button';
import { cn } from './cn';

/**
 * The one page layout every list page shares (#326, redesigned for less scrolling):
 *
 *   Title (count)                                   [actions…] [grid|list] [+ New]
 *   This month 701,30 € · This year 2.238,60 €      ← summary: one line, not stat cards
 *   [search……………] [All | Verified | To check] [Filters]
 *   rows…
 *
 * On a phone the actions stay on the title's line and scroll sideways if they do not fit,
 * HeaderButtons show their icon only, and the page's "+ New" becomes the round button above
 * the section bar.
 */

export const PAGE_MAIN = 'max-w-[1400px] mx-auto px-4 lg:px-8 py-5 lg:py-7 pb-28 lg:pb-10';

export function PageHeader({
  title,
  icon,
  count,
  subtitle,
  summary,
  children,
}: {
  title: React.ReactNode;
  icon?: React.ReactNode;
  /** The number of records, shown as a small pill next to the title. */
  count?: React.ReactNode;
  /** One line under the title, for pages that need to explain themselves. */
  subtitle?: React.ReactNode;
  /** One line of totals under the title: <HeaderTotals>. Replaces the big stat cards. */
  summary?: React.ReactNode;
  /** Right side, in this order: HeaderButtons, ViewToggle, PrimaryAction. */
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-4 lg:mb-5">
      <div className="flex items-center gap-3 min-h-11">
        <div className="flex items-center gap-2.5 min-w-0 shrink">
          <h1 className="text-2xl lg:text-[28px] leading-tight font-semibold flex items-center gap-2 min-w-0" style={{ fontFamily: 'var(--font-display)' }}>
            {icon && <span className="text-[color:var(--color-accent)] shrink-0">{icon}</span>}
            <span className="truncate">{title}</span>
          </h1>
          {count != null && count !== '' && (
            <span className="shrink-0 text-xs font-medium tabular-nums text-[color:var(--color-text-dim)] bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] rounded-full px-2 py-0.5">
              {count}
            </span>
          )}
        </div>
        {children && (
          // The inner row is as wide as its buttons and pushed right: when they do not fit it
          // overflows to the right, where the row can scroll (justify-end would push the
          // first buttons off the left edge, out of reach).
          <div className="flex-1 min-w-0 overflow-x-auto no-scrollbar">
            <div className="flex items-center gap-2 w-max ml-auto">{children}</div>
          </div>
        )}
      </div>
      {subtitle && <p className="text-sm text-[color:var(--color-text-dim)] mt-1 max-w-3xl">{subtitle}</p>}
      {summary && <div className="mt-1">{summary}</div>}
    </div>
  );
}

/** One line of totals for PageHeader's `summary`: "This month 701,30 € · This year …". */
export function HeaderTotals({ items }: { items: { label: React.ReactNode; value: React.ReactNode; tone?: 'accent' | 'gold' | 'red' }[] }) {
  return (
    <p className="text-sm text-[color:var(--color-text-dim)] flex flex-wrap gap-x-1.5 gap-y-0.5">
      {items.map((it, i) => (
        <span key={i} className="whitespace-nowrap">
          {i > 0 && <span aria-hidden className="mr-1.5 text-[color:var(--color-text-faint)]">·</span>}
          {it.label}{' '}
          <strong className="font-semibold tabular-nums" style={{ color: it.tone ? `var(--color-${it.tone})` : 'var(--color-text)' }}>
            {it.value}
          </strong>
        </span>
      ))}
    </p>
  );
}

const TONE: Record<string, string> = {
  default: 'text-[color:var(--color-text)]',
  accent: 'text-[color:var(--color-accent)]',
  cyan: 'text-[color:var(--color-cyan)]',
  purple: 'text-[color:var(--color-purple)]',
  gold: 'text-[color:var(--color-gold)]',
};

/** A secondary header action (Select, Duplicates, Import CSV…). With an icon it shows only
 *  the icon on a phone, so the actions fit beside the title. */
export function HeaderButton({
  icon,
  children,
  tone = 'default',
  className,
  title,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { icon?: React.ReactNode; tone?: keyof typeof TONE }) {
  const text = typeof children === 'string' ? children : undefined;
  return (
    <button
      type="button"
      title={title ?? text}
      aria-label={icon ? text ?? title : undefined}
      {...rest}
      className={cn(
        'shrink-0 flex items-center justify-center gap-1.5 h-10 min-w-10 px-2.5 sm:px-3 rounded-[10px] text-sm font-semibold whitespace-nowrap bg-[color:var(--color-surface-2)] border border-[color:var(--color-border-light)] hover:bg-[color:var(--color-surface-3)] transition-colors disabled:opacity-50',
        TONE[tone],
        className
      )}
    >
      {icon}
      {icon ? <span className="hidden sm:inline">{children}</span> : children}
    </button>
  );
}

/** A figure shown on the right of the header ("est. cost €767"). */
export function HeaderStat({ label, value, color = 'var(--color-text)' }: { label: React.ReactNode; value: React.ReactNode; color?: string }) {
  return (
    <span className="shrink-0 text-sm text-[color:var(--color-text-dim)] whitespace-nowrap">
      {label} <span className="font-semibold tabular-nums" style={{ color }}>{value}</span>
    </span>
  );
}

/** List / grid layout switch. Lists come first: rows are the default everywhere. */
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
      { value: 'list', icon: <ListIcon size={16} />, title: t('v.list') },
      { value: 'grid', icon: <LayoutGrid size={16} />, title: t('v.grid') },
    ] as { value: V; icon: React.ReactNode; title?: string }[]);
  return (
    <div className="shrink-0 flex h-10 items-center bg-[color:var(--color-surface-2)] border border-[color:var(--color-border-light)] rounded-[10px] p-0.5">
      {opts.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          title={o.title}
          aria-label={o.title}
          aria-pressed={value === o.value}
          className={cn(
            'h-full px-2.5 rounded-lg transition-colors',
            value === o.value ? 'bg-[color:var(--color-surface-3)] text-[color:var(--color-text)]' : 'text-[color:var(--color-text-faint)] hover:text-[color:var(--color-text)]'
          )}
        >
          {o.icon}
        </button>
      ))}
    </div>
  );
}

/**
 * The page's main action. On a computer it is the last button of the header; on a phone it is
 * the round button above the section bar, where the thumb is.
 */
export function PrimaryAction({ onClick, children, icon, disabled }: { onClick: () => void; children?: React.ReactNode; icon?: React.ReactNode; disabled?: boolean }) {
  const t = useT();
  const label = children ?? t('common.new');
  return (
    <>
      <Button variant="primary" onClick={onClick} disabled={disabled} className="hidden lg:inline-flex shrink-0">
        {icon ?? <Plus size={16} strokeWidth={2.5} />} {label}
      </Button>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={typeof label === 'string' ? label : t('common.new')}
        className="lg:hidden fixed right-4 z-30 bottom-[calc(80px+env(safe-area-inset-bottom))] w-14 h-14 rounded-full grid place-items-center bg-[color:var(--color-accent)] text-[color:var(--color-on-accent)] shadow-[0_8px_24px_rgba(0,0,0,0.5)] active:scale-95 transition-transform disabled:opacity-50"
      >
        {icon ?? <Plus size={24} strokeWidth={2.4} />}
      </button>
    </>
  );
}

/**
 * Search, the main status switch and a Filters button in one row above the list; everything
 * else opens in a panel under the row. `filters` is the panel; `search` and `quick` stay in
 * the row. A page with nothing beyond search and status passes no `filters`.
 */
export function FilterLayout({
  filters,
  active,
  search,
  quick,
  children,
}: {
  filters?: React.ReactNode;
  active?: boolean;
  search?: React.ReactNode;
  quick?: React.ReactNode;
  children: React.ReactNode;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <div>
      {(search || quick || filters) && (
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {search && <div className="flex-1 min-w-[160px] sm:max-w-sm">{search}</div>}
          {filters && (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              className={cn(
                // Beside the search on a phone (the switch gets its own line); after the switch
                // when there is no search, or on a wider screen.
                search ? 'sm:order-last' : 'order-last',
                'shrink-0 flex items-center gap-1.5 h-10 px-3 rounded-[10px] text-sm font-semibold border border-[color:var(--color-border-light)] transition-colors',
                open || active
                  ? 'bg-[color:var(--color-surface-3)] text-[color:var(--color-text)]'
                  : 'bg-[color:var(--color-surface-2)] text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)]'
              )}
            >
              <SlidersHorizontal size={15} /> {t('ex.filters')}
              {active && <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--color-accent)]" aria-hidden />}
            </button>
          )}
          {quick && <div className={cn(search ? 'w-full sm:w-auto' : 'flex-1 sm:flex-none', 'min-w-0 overflow-x-auto no-scrollbar')}>{quick}</div>}
        </div>
      )}
      {open && filters && (
        <div className="filter-panel mb-4 rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-4">{filters}</div>
      )}
      {children}
    </div>
  );
}

/** A labelled block inside the filter panel. */
export function FilterSection({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium text-[color:var(--color-text-dim)] mb-1.5">{label}</p>
      {children}
    </div>
  );
}

/**
 * A single-choice switch (STATUS: All / Open / Paid…). `segmented` is the horizontal control
 * of the filter row (FilterLayout's `quick`); `list`, the default, stacks the options inside
 * the panel.
 */
export function FilterOptions<V extends string>({
  value,
  onChange,
  options,
  variant = 'list',
}: {
  value: V;
  onChange: (v: V) => void;
  options: { value: V; label: React.ReactNode }[];
  variant?: 'segmented' | 'list';
}) {
  if (variant === 'list') {
    return (
      <div className="flex flex-col gap-1">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={value === o.value}
            className={cn(
              'text-left px-3 h-9 rounded-lg text-sm font-medium transition-colors',
              value === o.value
                ? 'bg-[color:var(--color-surface-3)] text-[color:var(--color-text)]'
                : 'text-[color:var(--color-text-dim)] hover:bg-[color:var(--color-surface-2)] hover:text-[color:var(--color-text)]'
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    );
  }
  return (
    <div className="inline-flex h-10 items-center p-0.5 rounded-[10px] bg-[color:var(--color-surface-2)] border border-[color:var(--color-border-light)]">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={cn(
            'h-full px-3 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors',
            value === o.value
              ? 'bg-[color:var(--color-surface-3)] text-[color:var(--color-text)]'
              : 'text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)]'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
