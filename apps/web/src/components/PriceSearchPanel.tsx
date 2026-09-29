'use client';
import { cur } from '@/lib/money';
import { useState, useTransition } from 'react';
import { Search, Loader2, Check, ExternalLink, AlertTriangle, Plus } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { cn } from '@/components/ui/cn';
import { useRouter } from 'next/navigation';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { getBulkAiGuard } from '@/app/jobActions';
import { searchItemPriceCandidates, addPriceLinks, type PriceCandidate } from '@/app/items/actions';
import type { SerializedItem } from '@/types';
import type { StoreSearchOutcome } from '@/lib/storeSearch';
import { useT } from '@/components/LocaleProvider';
import { estimateTaskCost, formatTaskCost } from '@/lib/claudePricing';
import { EmptyState } from '@/components/ui/EmptyState';

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
  const t = useT();
  const router = useRouter();
  const confirm = useConfirm();
  const [query, setQuery] = useState(item.title);
  const [searching, setSearching] = useState(false);
  const [candidates, setCandidates] = useState<PriceCandidate[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [directUrl, setDirectUrl] = useState('');
  const [addingDirect, setAddingDirect] = useState(false);
  const [directError, setDirectError] = useState<string | null>(null);
  const [outcomes, setOutcomes] = useState<StoreSearchOutcome[] | null>(null);
  const [, startTransition] = useTransition();

  function addDirectLink() {
    const url = directUrl.trim();
    if (!url || !/^https?:\/\//i.test(url)) {
      setDirectError('Please enter a valid http(s) URL');
      return;
    }
    setDirectError(null);
    setAddingDirect(true);
    startTransition(async () => {
      const r = await addPriceLinks(item._id, [{ store: '', url, price: 0 }]);
      setAddingDirect(false);
      if (r.ok && r.item) {
        setDirectUrl('');
        onAdded(r.item);
        router.refresh();
        onClose();
      } else {
        setDirectError(r.error ?? 'Could not add the link');
      }
    });
  }

  async function runSearch() {
    setError(null);
    // Cost guard — this fires up to 5 page-fetches + AI calls.
    const g = await getBulkAiGuard();
    if (g.confirm) {
      const unitCost = estimateTaskCost(g.model, 'priceSearch');
      const totalCost = (5 * unitCost).toFixed(2);
      const unitStr = formatTaskCost(unitCost);
      const ok = await confirm({
        title: 'Search prices online?',
        message:
          g.provider === 'anthropic'
            ? `Reads up to 5 shops with ${g.model}. Rough cost ~$${totalCost} (≈${unitStr}/shop).`
            : `Reads up to 5 shops with ${g.model}. Local — free but slow.`,
        confirmLabel: 'Search',
      });
      if (!ok) return;
    }
    setSearching(true);
    setCandidates(null);
    setOutcomes(null);
    setPicked(new Set());
    const r = await searchItemPriceCandidates(item._id, query.trim());
    setSearching(false);
    if (r.storeOutcomes) {
      setOutcomes(r.storeOutcomes);
    }
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
  const lowestPrice = candidates
    ? candidates.reduce<number | null>(
        (min, c) => (c.price > 0 && !c.error && (min === null || c.price < min) ? c.price : min),
        null
      )
    : null;

  return (
    <Modal open={open} onClose={onClose} title={t('ps.title')} size="lg">
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
          <div className="py-12 flex flex-col items-center gap-3 text-center">
            <Loader2 size={24} className="animate-spin text-[color:var(--color-accent)]" />
            <p className="text-xs font-medium text-[color:var(--color-text)]">
              AI selecting best stores & reading prices via headless sandbox…
            </p>
            <p className="text-[11px] text-[color:var(--color-text-faint)]" style={{ fontFamily: 'var(--font-mono)' }}>
              Analyzing product category, querying relevant stores, and extracting live prices.
            </p>
          </div>
        )}

        {error && (
          <p className="text-xs text-[color:var(--color-red)]" style={{ fontFamily: 'var(--font-mono)' }}>
            {error}
          </p>
        )}

        {outcomes && outcomes.length > 0 && !searching && (
          <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px] text-[color:var(--color-text-faint)]">
            <span className="font-medium">Stores checked:</span>
            {outcomes.map((o) => (
              <span
                key={o.domain}
                className={cn(
                  'px-1.5 py-0.5 rounded border text-[10px] inline-flex items-center gap-1',
                  o.status === 'searched' && (o.matchCount ?? 0) > 0
                    ? 'border-[color:var(--color-green)]/30 text-[color:var(--color-green)] bg-[color:var(--color-green)]/5'
                    : o.status === 'failed'
                      ? 'border-[color:var(--color-red)]/30 text-[color:var(--color-red)] bg-[color:var(--color-red)]/5'
                      : 'border-[color:var(--color-border)] text-[color:var(--color-text-faint)] bg-[color:var(--color-surface-2)]'
                )}
                title={o.error || o.reason || o.status}
              >
                {o.store}
                {o.status === 'searched' && typeof o.matchCount === 'number' && (
                  <span className="opacity-70">({o.matchCount})</span>
                )}
                {o.status === 'no_match' && <span className="opacity-70">(0)</span>}
                {o.status === 'failed' && <span className="opacity-70">(failed)</span>}
                {o.status === 'not_attempted' && <span className="opacity-70">(skipped)</span>}
              </span>
            ))}
          </div>
        )}

        {candidates && !searching && (
          candidates.length === 0 ? (
            <EmptyState className="py-10" icon={<Search />} title={t('ps.noShops')} />
          ) : (
            <div className="space-y-1.5">
              {candidates.map((c) => {
                const disabled = c.price <= 0 || !!c.error;
                const on = picked.has(c.url);
                const isLowest = lowestPrice !== null && c.price === lowestPrice && !c.error;
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
                        {isLowest && (
                          <span className="text-[9px] uppercase tracking-wider font-semibold text-[color:var(--color-green)] bg-[color:var(--color-green)]/10 px-1.5 py-0.5 rounded shrink-0">
                            Lowest
                          </span>
                        )}
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

        <div className="pt-3 border-t border-[color:var(--color-border)]">
          <p className="text-xs font-semibold text-[color:var(--color-text)] mb-1.5">
            Or track a specific product URL manually:
          </p>
          <div className="flex items-center gap-2">
            <input
              value={directUrl}
              onChange={(e) => setDirectUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !addingDirect && directUrl.trim() && addDirectLink()}
              placeholder="https://example-shop.com/product/..."
              className="flex-1 min-w-0 text-xs px-3 py-2 rounded-lg bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] focus:border-[color:var(--color-accent)] outline-none"
            />
            <Button
              variant="secondary"
              onClick={addDirectLink}
              disabled={addingDirect || !directUrl.trim()}
              className="shrink-0 text-xs"
            >
              {addingDirect ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
              Add Link
            </Button>
          </div>
          {directError && (
            <p className="text-[11px] text-[color:var(--color-red)] mt-1" style={{ fontFamily: 'var(--font-mono)' }}>
              {directError}
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}
