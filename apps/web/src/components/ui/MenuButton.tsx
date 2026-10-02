'use client';
import { useEffect, useRef, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';

export type MenuItem = { label: string; hint?: string; icon?: React.ReactNode; onClick: () => void; disabled?: boolean };

/** A "⋯" button with a short menu of secondary actions. Closes on pick, outside click or Esc. */
export function MenuButton({ items, label, disabled = false }: { items: MenuItem[]; label: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!items.length) return null;
  return (
    <div ref={ref} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex h-8 items-center rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] px-2 text-[color:var(--color-text-dim)] transition-colors hover:border-[color:var(--color-border-light)] hover:text-[color:var(--color-text)] disabled:opacity-50"
      >
        <MoreHorizontal size={15} />
      </button>
      {open && (
        <div role="menu" className="absolute left-0 top-full z-20 mt-1 w-64 rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-1 shadow-lg">
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              disabled={it.disabled}
              onClick={() => {
                setOpen(false);
                it.onClick();
              }}
              className="flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left hover:bg-[color:var(--color-surface-2)] disabled:opacity-50"
            >
              {it.icon && <span className="mt-0.5 shrink-0 text-[color:var(--color-text-dim)]">{it.icon}</span>}
              <span>
                <span className="block text-xs font-medium text-[color:var(--color-text)]">{it.label}</span>
                {it.hint && <span className="block text-[11px] text-[color:var(--color-text-faint)]">{it.hint}</span>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
