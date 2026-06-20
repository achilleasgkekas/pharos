'use client';
import { cur } from '@/lib/money';
import { useState, useTransition } from 'react';
import { Search, Loader2, Check, ExternalLink, AlertTriangle } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { cn } from '@/components/ui/cn';
import { useRouter } from 'next/navigation';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { getBulkAiGuard } from '@/app/jobActions';
import { searchItemPriceCandidates, addPriceLinks, type PriceCandidate } from '@/app/items/actions';
import type { SerializedItem } from '@/types';

function linkHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/**
 * Interactive online price search: type a query, read up to 5 shops, and PICK which
 * ones to start tracking. Each pick becomes a store link (store + URL + price) that
 * feeds "Where to buy", price history, and the 6-hourly scraper.
 */
export function PriceSearchPanel({
  item,
  open,
  onClose,
  onAdded,
}: {
  item: SerializedItem;
  open: boolean;
  onClose: () => void;
  onAdded: (item: SerializedItem) => void;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [query, setQuery] = useState(item.title);
  const [searching, setSearching] = useState(false);
  const [candidates, setCandidates] = useState<PriceCandidate[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [, startTransition] = useTransition();

  async function runSearch() {
    setError(null);
    // Cost guard — this fires up to 5 page-fetches + AI calls.
    const g = await getBulkAiGuard();
    if (g.confirm) {
      const ok = await confirm({
        title: 'Search prices online?',
        message:
          g.provider === 'anthropic'
            ? `Reads up to 5 shops with ${g.model}. Rough cost ~$0.10 (≈$0.02/shop).`
            : `Reads up to 5 shops with ${g.model}. Local — free but slow.`,
        confirmLabel: 'Search',
      });
      if (!ok) return;
    }
    setSearching(true);
    setCandidates(null);
    setPicked(new Set());
    const r = await searchItemPriceCandidates(item._id, query.trim());
    setSearching(false);
    if (!r.ok) {
      setError(r.error ?? 'Search failed');
      return;
    }
    setCandidates(r.candidates);
    // Pre-select priced, not-yet-tracked, readable results.
    setPicked(new Set(r.candidates.filter((c) => c.price > 0 && !c.alreadyLinked && !c.error).map((c) => c.url)));
  }

  function toggle(url: string) {
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(url)) n.delete(url);
      else n.add(url);
      return n;
    });
  }

  function addPicked() {
    if (!candidates) return;
    const picks = candidates
      .filter((c) => picked.has(c.url) && c.price > 0)
      .map((c) => ({ store: c.store, url: c.url, price: c.price, currency: c.currency }));
    if (picks.length === 0) return;
    setAdding(true);
    startTransition(async () => {
      const r = await addPriceLinks(item._id, picks);
      setAdding(false);
      if (r.ok && r.item) {
        onAdded(r.item);
        router.refresh();
        onClose();
      } else {
        setError(r.error ?? 'Could not add the price links');
      }
    });
  }

  const pickableCount = candidates ? candidates.filter((c) => picked.has(c.url) && c.price > 0).length : 0;

  return (
    <Modal open={open} onClose={onClose} title="Search prices online" size="lg">
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !searching && query.trim() && runSearch()}
            placeholder="what to search for"
            className="flex-1 min-w-0 text-sm px-3 py-2 rounded-lg bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] focus:border-[color:var(--color-accent)] outline-none"
          />
          <Button variant="primary" onClick={runSearch} disabled={searching || !query.trim()}>
            {searching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />} Search
          </Button>
        </div>
        <p className="text-[11px] text-[color:var(--color-text-faint)]" style={{ fontFamily: 'var(--font-mono)' }}>
          Pick which shops to track — each becomes a store link (URL + price) and is re-checked every 6 hours.
        </p>

        {searching && (
          <div className="py-12 flex flex-col items-center gap-3 text-[color:var(--color-text-dim)]">
            <Loader2 size={24} className="animate-spin" />
            <p className="text-xs" style={{ fontFamily: 'var(--font-mono)' }}>
              Reading up to 5 shops + AI extracting the price…
            </p>
          </div>
        )}

        {error && (
          <p className="text-xs text-[color:var(--color-red)]" style={{ fontFamily: 'var(--font-mono)' }}>
            {error}
          </p>
        )}

        {candidates && !searching && (
          candidates.length === 0 ? (
            <div className="py-10 text-center text-[color:var(--color-text-faint)]">
              <p className="text-3xl mb-2">🔍</p>
              <p className="text-sm">No shops found for this search.</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {candidates.map((c) => {
                const disabled = c.price <= 0 || !!c.error;
                const on = picked.has(c.url);
                return (
                  <div
                    key={c.url}
                    className={cn(
                      'flex items-center gap-2.5 rounded-lg border px-3 py-2 transition-colors',
                      disabled
                        ? 'border-[color:var(--color-border)] opacity-55'
                        : on
                          ? 'border-[color:var(--color-accent)] bg-[color:var(--color-surface-2)] cursor-pointer'
                          : 'border-[color:var(--color-border)] hover:border-[color:var(--color-border-light)] cursor-pointer'
                    )}
                    onClick={() => !disabled && toggle(c.url)}
                  >
                    <span
                      className={cn(
                        'shrink-0 w-4 h-4 rounded border flex items-center justify-center',
                        disabled
                          ? 'border-[color:var(--color-border)]'
                          : on
                            ? 'border-[color:var(--color-accent)] bg-[color:var(--color-accent)]'
                            : 'border-[color:var(--color-border-light)]'
                      )}
                    >
                      {on && !disabled && <Check size={11} strokeWidth={3} className="text-black" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="text-sm font-semibold text-[color:var(--color-text)] truncate">{c.store}</span>
                        {c.alreadyLinked && (
                          <span className="text-[9px] uppercase tracking-wider text-[color:var(--color-cyan)] shrink-0">already tracked</span>
                        )}
                      </span>
                      <span className="flex items-center gap-1 text-[10px] text-[color:var(--color-text-faint)]">
                        <a
                          href={c.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="hover:text-[color:var(--color-cyan)] truncate inline-flex items-center gap-0.5"
                        >
                          {linkHost(c.url)} <ExternalLink size={9} />
                        </a>
                      </span>
                      {c.error && (
                        <span className="flex items-center gap-1 text-[10px] text-[color:var(--color-gold)] mt-0.5">
                          <AlertTriangle size={10} /> {c.error}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-right">
                      {c.price > 0 ? (
                        <span className="text-sm font-bold text-[color:var(--color-text)]" style={{ fontFamily: 'var(--font-mono)' }}>
                          {cur()}
                          {c.price}
                        </span>
                      ) : (
                        <span className="text-[10px] text-[color:var(--color-text-faint)]" style={{ fontFamily: 'var(--font-mono)' }}>
                          no price
                        </span>
                      )}
                    </span>
                  </div>
                );
              })}

              <div className="flex justify-end pt-2">
                <Button variant="primary" onClick={addPicked} disabled={adding || pickableCount === 0}>
                  {adding ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                  Add {pickableCount} price link{pickableCount === 1 ? '' : 's'}
                </Button>
              </div>
            </div>
          )
        )}
      </div>
    </Modal>
  );
}
