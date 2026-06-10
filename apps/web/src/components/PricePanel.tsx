'use client';
import { useState, useMemo, useTransition } from 'react';
import { cur } from '@/lib/money';
import { Target, Plus, TrendingDown, TrendingUp, Check, Loader2 } from 'lucide-react';
import type { SerializedItem } from '@/types';
import { logItemPrice } from '@/app/items/actions';

function linkHost(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

type Verdict = 'deal' | 'dropping' | 'rising' | 'good' | 'none';

/** One coherent price picture for a shopping item, replacing the scattered
 *  currentPrice / link-price / lowest / trend / deal concepts. */
function priceStatus(item: SerializedItem) {
  // Best available right now = lowest of the current price + every store-link price.
  let bestNow: { price: number; store: string } | null =
    item.currentPrice > 0 ? { price: item.currentPrice, store: 'current' } : null;
  for (const l of item.links ?? []) {
    if (l.price && l.price > 0 && (!bestNow || l.price < bestNow.price)) {
      bestNow = { price: l.price, store: l.label || linkHost(l.url) };
    }
  }

  const hist = [...(item.priceHistory ?? [])].filter((h) => h.price > 0).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const lowestEver = hist.length ? hist.reduce((lo, h) => (h.price < lo.price ? h : lo), hist[0]) : null;
  const trend = hist.length >= 2 && hist[hist.length - 1].price !== hist[hist.length - 2].price ? hist[hist.length - 1].price - hist[hist.length - 2].price : 0;

  const target = item.targetPrice && item.targetPrice > 0 ? item.targetPrice : null;
  const lowMark = lowestEver?.price ?? bestNow?.price ?? null;

  let verdict: Verdict = 'none';
  if (bestNow) {
    if (target && bestNow.price <= target) verdict = 'deal';
    else if (trend < 0) verdict = 'dropping';
    else if (trend > 0) verdict = 'rising';
    else if (lowMark != null && bestNow.price <= lowMark * 1.05) verdict = 'good';
  }

  return { bestNow, lowestEver, target, trend, verdict, hist };
}

const VERDICT_META: Record<Verdict, { label: string; cls: string; icon?: typeof TrendingDown }> = {
  deal: { label: 'Deal — at/below target', cls: 'text-[color:var(--color-accent)] bg-[color:var(--color-accent)]/12' },
  dropping: { label: 'Dropping', cls: 'text-[color:var(--color-accent)] bg-[color:var(--color-accent)]/12', icon: TrendingDown },
  rising: { label: 'Rising — maybe wait', cls: 'text-[color:var(--color-gold)] bg-[color:var(--color-gold)]/12', icon: TrendingUp },
  good: { label: 'Good price', cls: 'text-[color:var(--color-cyan)] bg-[color:var(--color-cyan)]/12' },
  none: { label: '', cls: '' },
};

/** Tiny inline SVG sparkline of best price over time, with an optional target line. */
function Sparkline({ points, target }: { points: number[]; target: number | null }) {
  if (points.length < 2) return null;
  const W = 100, H = 32, pad = 3;
  const vals = target != null ? [...points, target] : points;
  const min = Math.min(...vals), max = Math.max(...vals);
  const span = max - min || 1;
  const x = (i: number) => pad + (i * (W - 2 * pad)) / (points.length - 1);
  const y = (v: number) => H - pad - ((v - min) / span) * (H - 2 * pad);
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p).toFixed(1)}`).join(' ');
  const down = points[points.length - 1] <= points[0];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" aria-hidden>
      {target != null && (
        <line x1="0" y1={y(target)} x2={W} y2={y(target)} stroke="var(--color-border-light)" strokeWidth="1" strokeDasharray="3 3" />
      )}
      <path d={path} fill="none" stroke={down ? 'var(--color-accent)' : 'var(--color-gold)'} strokeWidth="1.5" />
      <circle cx={x(points.length - 1)} cy={y(points[points.length - 1])} r="2" fill={down ? 'var(--color-accent)' : 'var(--color-gold)'} />
    </svg>
  );
}

const money = (n: number) => `${cur()}${Math.round(n * 100) / 100}`;
const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

export function PricePanel({ item, onChanged }: { item: SerializedItem; onChanged?: () => void }) {
  const s = useMemo(() => priceStatus(item), [item]);
  const [pending, startTransition] = useTransition();
  const [logging, setLogging] = useState(false);
  const [price, setPrice] = useState('');
  const [store, setStore] = useState('');

  const stores = useMemo(() => [...new Set((item.links ?? []).map((l) => l.label).filter(Boolean))], [item.links]);
  const v = VERDICT_META[s.verdict];
  const toGo = s.target && s.bestNow ? s.bestNow.price - s.target : null;

  function submit() {
    const p = Number(price);
    if (!(p > 0)) return;
    startTransition(async () => {
      const r = await logItemPrice(item._id, p, store);
      if (r.ok) { setPrice(''); setStore(''); setLogging(false); onChanged?.(); }
    });
  }

  return (
    <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <span className="text-[10px] uppercase tracking-[0.15em] text-[color:var(--color-text-faint)]" style={{ fontFamily: 'var(--font-mono)' }}>Price</span>
        {v.label && (
          <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full ${v.cls}`} style={{ fontFamily: 'var(--font-mono)' }}>
            {v.icon && <v.icon size={12} />}{v.label}
          </span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2.5">
        <Stat label="Best now" value={s.bestNow ? money(s.bestNow.price) : '—'} sub={s.bestNow && s.bestNow.store !== 'current' ? s.bestNow.store : ''} />
        <Stat label="Lowest ever" value={s.lowestEver ? money(s.lowestEver.price) : '—'} sub={s.lowestEver ? fmtDate(s.lowestEver.date) : ''} accent="accent" />
        <Stat
          label="Your target"
          value={s.target ? money(s.target) : '—'}
          sub={toGo != null ? (toGo <= 0 ? 'reached ✓' : `${money(toGo)} to go`) : 'not set'}
        />
      </div>

      {s.hist.length >= 2 && (
        <div className="mt-3">
          <Sparkline points={s.hist.map((h) => h.price)} target={s.target} />
        </div>
      )}

      {!logging ? (
        <button
          onClick={() => setLogging(true)}
          className="mt-3 flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-[color:var(--color-border)] hover:border-[color:var(--color-accent)] transition-colors"
        >
          <Plus size={13} /> Log a price
        </button>
      ) : (
        <div className="mt-3 flex items-center gap-1.5 flex-wrap">
          <input
            autoFocus
            type="number"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder={`${cur()} price`}
            className="w-24 text-xs px-2.5 py-1.5 rounded-lg bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] focus:border-[color:var(--color-accent)] outline-none"
            style={{ fontFamily: 'var(--font-mono)' }}
          />
          <input
            value={store}
            onChange={(e) => setStore(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            list="price-stores"
            placeholder="store"
            className="w-28 text-xs px-2.5 py-1.5 rounded-lg bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] focus:border-[color:var(--color-accent)] outline-none"
          />
          <datalist id="price-stores">{stores.map((st) => <option key={st} value={st} />)}</datalist>
          <button onClick={submit} disabled={pending || !(Number(price) > 0)} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-[color:var(--color-accent)] text-black font-semibold hover:opacity-90 disabled:opacity-50">
            {pending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Save
          </button>
          <button onClick={() => setLogging(false)} className="text-xs text-[color:var(--color-text-faint)] hover:text-[color:var(--color-text)] px-1">cancel</button>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: 'accent' }) {
  return (
    <div className="bg-[color:var(--color-surface-2)] rounded-xl px-3 py-2.5">
      <p className="text-[10px] text-[color:var(--color-text-faint)] mb-0.5" style={{ fontFamily: 'var(--font-mono)' }}>{label}</p>
      <p className={`text-lg font-bold leading-none ${accent === 'accent' ? 'text-[color:var(--color-accent)]' : ''}`} style={{ fontFamily: 'var(--font-display)' }}>{value}</p>
      {sub && <p className="text-[10px] text-[color:var(--color-text-faint)] mt-1 truncate" style={{ fontFamily: 'var(--font-mono)' }}>{sub}</p>}
    </div>
  );
}

export { priceStatus, VERDICT_META };
