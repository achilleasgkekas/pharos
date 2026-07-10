'use client';
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Search, Check, X } from 'lucide-react';
import { cn } from './cn';
import { useT } from '@/components/LocaleProvider';

/**
 * A dropdown with a built-in search box — for picking from long lists (stores,
 * categories) where a row of chips or a native <select> doesn't scale. With
 * `allowCustom`, the typed query can be committed as a new value (e.g. a store the
 * AI got wrong: search the existing ones, or type the correct name).
 */
export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = 'Select…',
  allowCustom = false,
  clearable = false,
  size = 'md',
  className,
  labels,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
  allowCustom?: boolean;
  clearable?: boolean;
  size?: 'sm' | 'md';
  className?: string;
  /** Optional display labels per option value (e.g. a sentinel → "Unassigned"). */
  labels?: Record<string, string>;
}) {
  const t = useT();
  const labelFor = (v: string) => labels?.[v] ?? v;
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const filtered = options.filter((o) => `${o} ${labelFor(o)}`.toLowerCase().includes(q.trim().toLowerCase()));
  const showCustom =
    allowCustom && q.trim() && !options.some((o) => o.toLowerCase() === q.trim().toLowerCase());

  function pick(v: string) {
    onChange(v);
    setOpen(false);
    setQ('');
  }

  const pad = size === 'sm' ? 'px-2.5 py-1.5 text-xs' : 'px-3 py-2 text-sm';

  return (
    <div ref={ref} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'w-full flex items-center justify-between gap-2 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] text-left hover:border-[color:var(--color-border-light)] focus:outline-none focus:border-[color:var(--color-accent)]',
          pad
        )}
      >
        <span className={cn('truncate', !value && 'text-[color:var(--color-text-faint)]')}>
          {value ? labelFor(value) : placeholder}
        </span>
        <span className="flex items-center gap-1 shrink-0">
          {clearable && value && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                pick('');
              }}
              className="text-[color:var(--color-text-faint)] hover:text-[color:var(--color-red)]"
            >
              <X size={14} />
            </span>
          )}
          <ChevronDown size={14} className="text-[color:var(--color-text-faint)]" />
        </span>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] shadow-xl overflow-hidden">
          <div className="flex items-center gap-1.5 px-2.5 py-2 border-b border-[color:var(--color-border)]">
            <Search size={13} className="text-[color:var(--color-text-faint)] shrink-0" />
            {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('common.searchDots')}
              className="flex-1 bg-transparent text-xs focus:outline-none text-[color:var(--color-text)]"
            />
          </div>
          <div className="max-h-60 overflow-y-auto py-1">
            {showCustom && (
              <button
                type="button"
                onClick={() => pick(q.trim())}
                className="w-full text-left px-3 py-1.5 text-xs text-[color:var(--color-accent)] hover:bg-[color:var(--color-surface-3)]"
              >
                + Use “{q.trim()}”
              </button>
            )}
            {filtered.map((o) => (
              <button
                key={o}
                type="button"
                onClick={() => pick(o)}
                className="w-full flex items-center justify-between gap-2 text-left px-3 py-1.5 text-xs text-[color:var(--color-text-dim)] hover:bg-[color:var(--color-surface-3)] hover:text-[color:var(--color-text)]"
              >
                <span className="truncate">{labelFor(o)}</span>
                {o === value && <Check size={13} className="text-[color:var(--color-accent)] shrink-0" />}
              </button>
            ))}
            {filtered.length === 0 && !showCustom && (
              <p className="px-3 py-2 text-xs text-[color:var(--color-text-faint)] italic">No matches</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
