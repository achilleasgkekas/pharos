'use client';
import { useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { recomputeAllItemPrices } from './actions';
import { useT } from '@/components/LocaleProvider';

export function RecomputePricesButton({ onDone }: { onDone?: () => void }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function run() {
    setBusy(true);
    setMsg('');
    const r = await recomputeAllItemPrices();
    setBusy(false);
    setMsg(r.ok ? t('rp.recomputed', { n: r.updated }) : t('common.failed'));
    if (r.ok && onDone) onDone();
    setTimeout(() => setMsg(''), 4000);
  }

  return (
    <div className="hidden sm:flex items-center gap-2">
      <button
        type="button"
        onClick={run}
        disabled={busy}
        title={t('rp.recomputeTitle')}
        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] text-[color:var(--color-text-dim)] hover:text-[color:var(--color-accent)] hover:border-[color:var(--color-accent)] transition-colors disabled:opacity-50"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} {t('rp.recompute')}
      </button>
      {msg && <span className="text-[11px] text-[color:var(--color-accent)] font-mono">{msg}</span>}
    </div>
  );
}
