'use client';
import { useState, useMemo, useTransition } from 'react';
import dynamic from 'next/dynamic';
import { cur } from '@/lib/money';
import { Plus, TrendingDown, TrendingUp, Check, Loader2, ChevronDown, ExternalLink, Target, Pencil, Search, RefreshCw, ArrowDown, ArrowUp, AlertTriangle } from 'lucide-react';
import type { SerializedItem } from '@/types';
import { logItemPrice, setItemTarget, refreshItemPrices, type PriceRefresh } from '@/app/items/actions';
import { calculatePriceTrend } from '@/lib/priceTrend';
import { getBulkAiGuard } from '@/app/jobActions';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { useLocale, useT } from '@/components/LocaleProvider';
import type { TKey } from '@/lib/i18n';
import { formatDate, formatTime, formatDateTime } from '@/lib/i18n/format';
import { useShoppingMarket } from '@/components/ShoppingMarketContext';
import { marketRank } from '@/lib/shoppingRegion';

const VERDICT_KEY: Record<string, TKey> = { deal: 'pp.vDeal', dropping: 'pp.vDropping', rising: 'pp.vRising', good: 'pp.vGood', high: 'pp.vHigh' };

/** A country code in the UI language ('GR' → 'Greece' / 'Ελλάδα'); the code itself if unknown. */
function regionName(code: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}

const PriceHistoryChart = dynamic(() => import('@/components/PriceHistoryChart').then((m) => m.PriceHistoryChart), { ssr: false });

function linkHost(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

type Verdict = 'deal' | 'dropping' | 'rising' | 'good' | 'high' | 'none';

/** One coherent price picture, replacing the scattered currentPrice / link-price /
 *  lowest / trend / deal concepts with: best-now, lowest/highest ever, trend, stores. */
function priceStatus(item: SerializedItem) {
  const stores = (item.links ?? [])
    .filter((l) => l.price && l.price > 0)
    .map((l) => ({ store: l.label || linkHost(l.url), url: l.url, price: l.price as number }))
    .sort((a, b) => a.price - b.price);

  // Headline best price = the cheapest ACTUAL store link. A standalone currentPrice
  // (seeded or hand-entered, with no store behind it) must NOT undercut real store
  // prices — it only fills in when there are no priced links at all.
  let bestNow: { price: number; store: string; url?: string } | null = stores[0] ? { ...stores[0] } : null;
  if (!bestNow && item.currentPrice > 0) bestNow = { price: item.currentPrice, store: '' };

  const hist = [...(item.priceHistory ?? [])].filter((h) => h.price > 0).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const prices = hist.map((h) => h.price);
  if (bestNow) prices.push(bestNow.price);
  const lowestEver = hist.length ? hist.reduce((lo, h) => (h.price < lo.price ? h : lo), hist[0]) : null;
  const lo = prices.length ? Math.min(...prices) : null;
  const hi = prices.length ? Math.max(...prices) : null;
  const rawTrend = calculatePriceTrend(item.priceHistory, bestNow);
  const trend = rawTrend ?? 0;

  const target = item.targetPrice && item.targetPrice > 0 ? item.targetPrice : null;

  let verdict: Verdict = 'none';
  if (bestNow && lo != null && hi != null) {
    const range = hi - lo || 1;
    const pos = (bestNow.price - lo) / range; // 0 = cheapest seen, 1 = priciest
    if (target && bestNow.price <= target) verdict = 'deal';
    else if (trend < 0) verdict = 'dropping';
    else if (trend > 0) verdict = 'rising';
    else if (pos <= 0.15) verdict = 'good';
    else if (pos >= 0.7) verdict = 'high';
  }

  return { bestNow, lowestEver, lo, hi, target, trend, verdict, hist, stores };
}

const VERDICT_META: Record<Verdict, { label: string; cls: string; icon?: typeof TrendingDown }> = {
  deal: { label: 'Deal · at/below target', cls: 'text-[color:var(--color-accent)] bg-[color:var(--color-accent)]/12' },
  dropping: { label: 'Dropping', cls: 'text-[color:var(--color-accent)] bg-[color:var(--color-accent)]/12', icon: TrendingDown },
  rising: { label: 'Rising · maybe wait', cls: 'text-[color:var(--color-gold)] bg-[color:var(--color-gold)]/12', icon: TrendingUp },
  good: { label: 'Good price', cls: 'text-[color:var(--color-cyan)] bg-[color:var(--color-cyan)]/12' },
  high: { label: 'Above usual', cls: 'text-[color:var(--color-gold)] bg-[color:var(--color-gold)]/12' },
  none: { label: '', cls: '' },
};

const money = (n: number) => `${cur()}${Math.round(n * 100) / 100}`;

export function PricePanel({ item, summary = true, onChanged, onSearchOnline }: { item: SerializedItem; summary?: boolean; onChanged?: () => void; onSearchOnline?: () => void }) {
  const locale = useLocale();
  const s = useMemo(() => priceStatus(item), [item]);
  const market = useShoppingMarket();
  const t = useT();
  const [pending, startTransition] = useTransition();
  const [logging, setLogging] = useState(false);
  const [editTarget, setEditTarget] = useState(false);
  const [showFull, setShowFull] = useState(false);
  const [price, setPrice] = useState('');
  const [store, setStore] = useState('');
  const [targetVal, setTargetVal] = useState(s.target ? String(s.target) : '');
  const sortedHist = useMemo(() => [...(item.priceHistory ?? [])].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()), [item.priceHistory]);

  const storeNames = useMemo(() => [...new Set((item.links ?? []).map((l) => l.label).filter(Boolean))], [item.links]);
  const v = VERDICT_META[s.verdict];
  const toGo = s.target && s.bestNow ? s.bestNow.price - s.target : null;
  const hasRange = s.lo != null && s.hi != null && s.hi > s.lo;

  function submitPrice() {
    const p = Number(price);
    if (!(p > 0)) return;
    startTransition(async () => {
      const r = await logItemPrice(item._id, p, store);
      if (r.ok) { setPrice(''); setStore(''); setLogging(false); onChanged?.(); }
    });
  }
  function saveTarget() {
    const tv = Number(targetVal);
    startTransition(async () => {
      await setItemTarget(item._id, tv > 0 ? tv : null);
      setEditTarget(false);
      onChanged?.();
    });
  }

  const confirm = useConfirm();
  const [refreshing, setRefreshing] = useState(false);
  const [refreshResults, setRefreshResults] = useState<PriceRefresh[] | null>(null);
  const linkCount = useMemo(() => (item.links ?? []).filter((l) => l.url && /^https?:\/\//i.test(l.url)).length, [item.links]);

  // Re-check the item's ALREADY-tracked store links right now + show the diff.
  async function runRefresh() {
    const g = await getBulkAiGuard();
    if (g.confirm) {
      const ok = await confirm({
        title: t('pp.confirmRefresh'),
        message:
          g.provider === 'anthropic'
            ? t('pp.confirmRefreshCloud', { n: linkCount, model: g.model })
            : t('pp.confirmRefreshLocal', { n: linkCount, model: g.model }),
        confirmLabel: t('pp.refresh'),
      });
      if (!ok) return;
    }
    setRefreshing(true);
    setRefreshResults(null);
    const r = await refreshItemPrices(item._id);
    setRefreshing(false);
    if (!r.ok) {
      setRefreshResults([{ store: '', url: '', oldPrice: null, newPrice: null, changed: 'error', error: r.error }]);
      return;
    }
    setRefreshResults(r.results);
    onChanged?.();
  }

  return (
    <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <span className="text-[10px] uppercase tracking-[0.15em] text-[color:var(--color-text-faint)]" style={{ fontFamily: 'var(--font-mono)' }}>
          {summary ? t('pp.price') : t('pp.priceHistory')}
        </span>
        {summary && v.label && (
          <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full ${v.cls}`} style={{ fontFamily: 'var(--font-mono)' }}>
            {v.icon && <v.icon size={12} />}{t(VERDICT_KEY[s.verdict] ?? 'pp.vGood')}
          </span>
        )}
      </div>

      {summary && (
        <>
          {/* Hero: the one number that matters + trend */}
          <div className="flex items-end justify-between gap-3 flex-wrap">
            <div className="flex items-end gap-2.5">
              <span className="text-3xl font-bold leading-none" style={{ fontFamily: 'var(--font-display)' }}>
                {s.bestNow ? money(s.bestNow.price) : '—'}
              </span>
              {s.bestNow?.store && (
                <span className="text-xs text-[color:var(--color-text-dim)] pb-0.5">{t('it.at')} {s.bestNow.store}</span>
              )}
            </div>
            {s.trend !== 0 && (
              <span className={`inline-flex items-center gap-1 text-xs font-semibold ${s.trend < 0 ? 'text-[color:var(--color-accent)]' : 'text-[color:var(--color-gold)]'}`} style={{ fontFamily: 'var(--font-mono)' }}>
                {s.trend < 0 ? <TrendingDown size={13} /> : <TrendingUp size={13} />}
                {s.trend < 0 ? t('pp.down') : t('pp.up')} {money(Math.abs(s.trend))}
              </span>
            )}
          </div>

          {/* Position bar: where the current price sits between cheapest & priciest seen */}
          {hasRange && s.bestNow && (
            <div className="mt-3">
              <div className="relative h-1.5 rounded-full bg-gradient-to-r from-[color:var(--color-accent)]/40 via-[color:var(--color-gold)]/30 to-[color:var(--color-red)]/40">
                {s.target != null && s.target >= s.lo! && s.target <= s.hi! && (
                  <div className="absolute -top-1 w-0.5 h-3.5 bg-[color:var(--color-cyan)]" style={{ left: `${((s.target - s.lo!) / (s.hi! - s.lo!)) * 100}%` }} title={t('pp.targetTip', { x: money(s.target) })} />
                )}
                <div
                  className="absolute -top-[3px] w-3 h-3 rounded-full bg-[color:var(--color-text)] border-2 border-[color:var(--color-surface)] shadow"
                  style={{ left: `calc(${((s.bestNow.price - s.lo!) / (s.hi! - s.lo!)) * 100}% - 6px)` }}
                  title={`now ${money(s.bestNow.price)}`}
                />
              </div>
              <div className="flex justify-between mt-1.5 text-[10px] text-[color:var(--color-text-faint)]" style={{ fontFamily: 'var(--font-mono)' }}>
                <span className="text-[color:var(--color-accent)]">{t('pp.lowest', { x: money(s.lo!) })}</span>
                {s.target != null && <span className="text-[color:var(--color-cyan)]">{t('pp.targetBar', { x: money(s.target) })}</span>}
                <span>{t('pp.highest', { x: money(s.hi!) })}</span>
              </div>
            </div>
          )}

          {/* Where to buy — cheapest first, each opens the store */}
          {s.stores.length >= 1 && (
            <div className="mt-3.5">
              <p className="text-[10px] uppercase tracking-wider text-[color:var(--color-text-faint)] mb-1.5" style={{ fontFamily: 'var(--font-mono)' }}>{t('it.whereToBuy')}</p>
              <div className="space-y-1">
                {s.stores.slice(0, 5).map((st, i) => (
                  <a key={i} href={st.url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 text-xs rounded-lg px-2.5 py-1.5 bg-[color:var(--color-surface-2)] hover:bg-[color:var(--color-surface-3)] transition-colors group">
                    <span className={`w-1.5 h-1.5 rounded-full ${i === 0 ? 'bg-[color:var(--color-accent)]' : 'bg-[color:var(--color-text-faint)]'}`} />
                    <span className="flex-1 truncate text-[color:var(--color-text-dim)]">{st.store}</span>
                    {market && st.url && marketRank(st.url, market) === null && (
                      <span
                        title={t('pp.outOfMarketTitle', { country: regionName(market.country, locale) })}
                        className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-[color:var(--color-gold)]/15 text-[color:var(--color-gold)]"
                      >
                        {t('pp.outOfMarket')}
                      </span>
                    )}
                    {i === 0 && s.stores.length > 1 && <span className="text-[9px] font-bold text-[color:var(--color-accent)] uppercase">{t('pp.cheapest')}</span>}
                    <span className="font-bold text-[color:var(--color-text)]" style={{ fontFamily: 'var(--font-mono)' }}>{money(st.price)}</span>
                    <ExternalLink size={11} className="text-[color:var(--color-text-faint)] group-hover:text-[color:var(--color-cyan)]" />
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Target (inline editable) + Log a price */}
          <div className="mt-3.5 flex items-center gap-3 flex-wrap text-xs">
            {editTarget ? (
              <span className="flex items-center gap-1.5">
                <Target size={13} className="text-[color:var(--color-cyan)]" />
                <input autoFocus type="number" value={targetVal} onChange={(e) => setTargetVal(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && saveTarget()}
                  placeholder={t('pp.targetPlaceholder', { cur: cur() })} className="w-24 text-xs px-2 py-1 rounded-lg bg-[color:var(--color-surface-2)] border border-[color:var(--color-cyan)] outline-none" style={{ fontFamily: 'var(--font-mono)' }} />
                <button onClick={saveTarget} disabled={pending} className="text-[color:var(--color-accent)]"><Check size={14} /></button>
                <button onClick={() => { setEditTarget(false); setTargetVal(s.target ? String(s.target) : ''); }} className="text-[color:var(--color-text-faint)]">{t('common.cancel')}</button>
              </span>
            ) : (
              <button onClick={() => setEditTarget(true)} className="flex items-center gap-1.5 text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)] transition-colors">
                <Target size={13} className="text-[color:var(--color-cyan)]" />
                {s.target ? (
                  <>{t('it.targetWord')} <b className="text-[color:var(--color-text)]">{money(s.target)}</b>{toGo != null && (toGo <= 0 ? <span className="text-[color:var(--color-accent)]"> · {t('pp.reached')}</span> : <span className="text-[color:var(--color-text-faint)]"> · {t('pp.toGo', { x: money(toGo) })}</span>)}</>
                ) : (
                  <>{t('pp.setTarget')}</>
                )}
                <Pencil size={11} className="text-[color:var(--color-text-faint)]" />
              </button>
            )}

            <div className="ml-auto flex items-center gap-3">
              {linkCount >= 1 && (
                <button onClick={runRefresh} disabled={refreshing} title={t('pp.refreshTitle')} className="flex items-center gap-1 text-[color:var(--color-text-dim)] hover:text-[color:var(--color-accent)] transition-colors disabled:opacity-50">
                  {refreshing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} {refreshing ? t('pp.refreshing') : t('pp.refreshPrices')}
                </button>
              )}
              {onSearchOnline && (
                <button onClick={onSearchOnline} className="flex items-center gap-1 text-[color:var(--color-text-dim)] hover:text-[color:var(--color-accent)] transition-colors">
                  <Search size={13} /> {t('pp.searchOnline')}
                </button>
              )}
              {!logging && (
                <button onClick={() => setLogging(true)} className="flex items-center gap-1 text-[color:var(--color-text-dim)] hover:text-[color:var(--color-accent)] transition-colors">
                  <Plus size={13} /> {t('pp.logPrice')}
                </button>
              )}
            </div>
          </div>

          {/* Refresh-prices diff — per tracked store: down / up / unchanged / error */}
          {refreshResults && (
            <div className="mt-2.5 space-y-1">
              {refreshResults.map((r, i) => (
                <div key={i} className="flex items-center gap-2 text-[11px]" style={{ fontFamily: 'var(--font-mono)' }}>
                  {r.changed === 'error' ? (
                    <AlertTriangle size={11} className="text-[color:var(--color-gold)] shrink-0" />
                  ) : r.changed === 'down' ? (
                    <ArrowDown size={11} className="text-[color:var(--color-accent)] shrink-0" />
                  ) : r.changed === 'up' ? (
                    <ArrowUp size={11} className="text-[color:var(--color-gold)] shrink-0" />
                  ) : (
                    <Check size={11} className="text-[color:var(--color-text-faint)] shrink-0" />
                  )}
                  <span className="text-[color:var(--color-text-dim)] flex-1 truncate">{r.store || 'price'}</span>
                  {r.changed === 'error' ? (
                    <span className="text-[color:var(--color-gold)] truncate">{r.error}</span>
                  ) : r.changed === 'same' ? (
                    <span className="text-[color:var(--color-text-faint)]">{t('pp.unchanged')}{r.newPrice != null ? ` · ${money(r.newPrice)}` : ''}</span>
                  ) : (
                    <span className="text-[color:var(--color-text)]">
                      {r.oldPrice != null ? money(r.oldPrice) : '—'} → <b>{r.newPrice != null ? money(r.newPrice) : '—'}</b>
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {logging && (
            <div className="mt-2.5 flex items-center gap-1.5 flex-wrap">
              <input autoFocus type="number" value={price} onChange={(e) => setPrice(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submitPrice()}
                placeholder={t('pp.pricePlaceholder', { cur: cur() })} className="w-24 text-xs px-2.5 py-1.5 rounded-lg bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] focus:border-[color:var(--color-accent)] outline-none" style={{ fontFamily: 'var(--font-mono)' }} />
              <input value={store} onChange={(e) => setStore(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submitPrice()} list="price-stores"
                placeholder={t('pp.storePlaceholder')} className="w-28 text-xs px-2.5 py-1.5 rounded-lg bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] focus:border-[color:var(--color-accent)] outline-none" />
              <datalist id="price-stores">{storeNames.map((st) => <option key={st} value={st} />)}</datalist>
              <button onClick={submitPrice} disabled={pending || !(Number(price) > 0)} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-[color:var(--color-accent)] text-black font-semibold hover:opacity-90 disabled:opacity-50">
                {pending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} {t('common.save')}
              </button>
              <button onClick={() => setLogging(false)} className="text-xs text-[color:var(--color-text-faint)] hover:text-[color:var(--color-text)] px-1">{t('common.cancel')}</button>
            </div>
          )}
        </>
      )}

      {/* Full per-store history — folded away */}
      {sortedHist.length > 0 && (
        <div className={summary ? 'mt-3.5 pt-3 border-t border-[color:var(--color-border)]' : ''}>
          <button onClick={() => setShowFull((f) => !f)} className="flex items-center gap-1.5 text-[11px] text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)] transition-colors" style={{ fontFamily: 'var(--font-mono)' }}>
            <ChevronDown size={13} className={`transition-transform ${showFull ? 'rotate-180' : ''}`} />
            {t('pp.fullHistory', { n: sortedHist.length })}{summary ? ` ${t('pp.checks')}` : ''}
          </button>
          {showFull && (
            <div className="mt-3">
              <PriceHistoryChart history={item.priceHistory} />
              <div className="space-y-1.5 mt-3 max-h-48 overflow-y-auto">
                {sortedHist.map((entry, i) => (
                  <div key={entry._id || i} className="flex items-center justify-between text-xs bg-[color:var(--color-surface-2)] rounded-lg px-3 py-2">
                    <span className="font-semibold text-[color:var(--color-text)]" style={{ fontFamily: 'var(--font-mono)' }}>{cur()}{entry.price}</span>
                    <span className="text-[color:var(--color-text-dim)]">{entry.store}</span>
                    <span className="text-[color:var(--color-text-faint)]">{formatDate(entry.date, locale)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export { priceStatus, VERDICT_META };
