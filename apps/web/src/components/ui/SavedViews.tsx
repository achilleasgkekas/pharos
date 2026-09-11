'use client';
import { useEffect, useRef, useState } from 'react';
import { Bookmark, ChevronDown, Trash2, Plus, Check } from 'lucide-react';
import { cn } from './cn';
import { useT } from '@/components/LocaleProvider';

/**
 * Saved filter presets / "smart views" (P87).
 *
 * The e-shop-layout rollout gave every list module (Items, Shopping, Receipts, Expenses,
 * Subscriptions, Vouchers) the same rich sidebar filter idiom, but nothing remembered a
 * combination — every visit rebuilt the same search+status+category+sort by hand. This is
 * the reusable primitive that fixes it: a named snapshot of whatever filter state the host
 * passes in, restored with one click.
 *
 * MVP is local-only by design (per the P87 spec): one localStorage bucket per module,
 * per browser/device, zero DB schema. Server-side sync across devices/household members is
 * a follow-up only if this proves useful. The host owns the shape of `current` — this
 * component just JSON round-trips it — so a Set must be handed in as an array and rebuilt
 * on apply.
 */

export type SavedView<S> = { id: string; name: string; state: S };

const PREFIX = 'pharosSavedViews.';

function storageKey(moduleKey: string): string {
  return PREFIX + moduleKey;
}

function loadViews<S>(moduleKey: string): SavedView<S>[] {
  try {
    const raw = localStorage.getItem(storageKey(moduleKey));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Defensive: only keep well-formed rows, so a hand-edited / corrupt bucket can't crash render.
    return parsed.filter(
      (v): v is SavedView<S> => v && typeof v.id === 'string' && typeof v.name === 'string' && 'state' in v
    );
  } catch {
    return [];
  }
}

function saveViews<S>(moduleKey: string, views: SavedView<S>[]): void {
  try {
    localStorage.setItem(storageKey(moduleKey), JSON.stringify(views));
  } catch {
    /* private mode / quota — the feature is a convenience, never fail the page over it */
  }
}

export function SavedViews<S>({
  moduleKey,
  current,
  canSave,
  onApply,
}: {
  moduleKey: string;
  /** Snapshot of the host's current filter state (JSON-serialisable). */
  current: S;
  /** Whether the current state is worth saving (usually "any filter active"). */
  canSave: boolean;
  onApply: (state: S) => void;
}) {
  const t = useT();
  const [views, setViews] = useState<SavedView<S>[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // localStorage is only available in the browser, so load after mount (never during SSR).
  useEffect(() => {
    setViews(loadViews<S>(moduleKey));
  }, [moduleKey]);

  // Close the menu on an outside click, the same as the app's other popovers.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  function persist(next: SavedView<S>[]) {
    setViews(next);
    saveViews(moduleKey, next);
  }

  function handleSave() {
    const name = window.prompt(t('views.namePrompt'))?.trim();
    if (!name) return;
    const id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `v${Date.now()}`;
    // Replace a same-named view rather than piling up duplicates.
    const next = [...views.filter((v) => v.name !== name), { id, name, state: current }];
    persist(next);
    setOpen(false);
  }

  function handleApply(v: SavedView<S>) {
    onApply(v.state);
    setOpen(false);
  }

  function handleDelete(id: string) {
    persist(views.filter((v) => v.id !== id));
  }

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 text-[0.65rem] text-[color:var(--color-text-faint)] hover:text-[color:var(--color-accent)] underline"
        style={{ fontFamily: 'var(--font-mono)' }}
        aria-expanded={open}
      >
        <Bookmark size={11} /> {t('views.label')}
        {views.length > 0 && <span className="opacity-70">({views.length})</span>}
        <ChevronDown size={11} />
      </button>

      {open && (
        <div
          className="absolute z-20 mt-1 min-w-[13rem] rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface)] shadow-lg p-1"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          {views.length === 0 ? (
            <p className="px-2 py-1.5 text-[11px] text-[color:var(--color-text-faint)]">{t('views.empty')}</p>
          ) : (
            views.map((v) => (
              <div
                key={v.id}
                className="flex items-center gap-1 rounded-md hover:bg-[color:var(--color-surface-2)]"
              >
                <button
                  type="button"
                  onClick={() => handleApply(v)}
                  className="flex-1 flex items-center gap-1.5 text-left px-2 py-1.5 text-[11px] text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)] min-w-0"
                >
                  <Check size={11} className="shrink-0 opacity-60" />
                  <span className="truncate">{v.name}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(v.id)}
                  className="p-1.5 text-[color:var(--color-text-faint)] hover:text-[color:var(--color-red)]"
                  aria-label={t('views.delete')}
                  title={t('views.delete')}
                >
                  <Trash2 size={11} />
                </button>
              </div>
            ))
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            className="flex items-center gap-1.5 w-full px-2 py-1.5 mt-0.5 text-[11px] text-[color:var(--color-accent)] hover:bg-[color:var(--color-surface-2)] rounded-md disabled:opacity-40 disabled:cursor-not-allowed border-t border-[color:var(--color-border)]"
            title={canSave ? undefined : t('views.saveDisabled')}
          >
            <Plus size={11} /> {t('views.saveCurrent')}
          </button>
        </div>
      )}
    </div>
  );
}
