'use client';
import { useState } from 'react';
import { Loader2, Coins } from 'lucide-react';
import { recomputeAllItemPrices } from '@/app/items/actions';

/** Maintenance: recompute every item's headline price from its store links + history,
 *  clearing stale/seeded prices (e.g. a €475 with no store behind it). */
export function RecomputePricesButton() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function run() {
    setBusy(true);
    setMsg('');
    const r = await recomputeAllItemPrices();
    setBusy(false);
    setMsg(r.ok ? `✓ Recomputed — ${r.updated} item${r.updated === 1 ? '' : 's'} updated` : 'Failed');
  }

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <button
        type="button"
        onClick={run}
        disabled={busy}
        title="Recompute item prices from their store links + history (fixes stale headline prices)"
        className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] text-[color:var(--color-text-dim)] hover:text-[color:var(--color-accent)] hover:border-[color:var(--color-accent)] transition-colors disabled:opacity-50"
      >
        {busy ? <Loader2 size={13} className="animate-spin" /> : <Coins size={13} />} Recompute item prices
      </button>
      {msg && <span className="text-[11px] text-[color:var(--color-text-dim)]" style={{ fontFamily: 'var(--font-mono)' }}>{msg}</span>}
    </div>
  );
}
