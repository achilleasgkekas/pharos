'use client';
import { useState, useTransition } from 'react';
import { RefreshCw } from 'lucide-react';
import { useT } from '@/components/LocaleProvider';
import { normalizeCurrency } from '@/lib/fx';
import { lookupMarketRate } from '@/app/fxRateActions';
import { cn } from '@/components/ui/cn';

/**
 * "Market rate" (P9 phase 2): fetch the ECB reference rate for `currency` and hand it to
 * the caller, which puts it in the rate field the user was already typing into.
 *
 * Deliberately a BUTTON and not an effect: nothing about P9 changes a stored amount
 * without the user saying so, and a rate that appeared on its own would be indistinguishable
 * from one they checked. The fetched day is shown next to it because a weekend/holiday date
 * resolves to the previous working day's fixing, and because these are reference rates, not
 * what a card issuer actually charged.
 *
 * Shared by the six edit forms and the /reports audit panel, so the wording, the failure
 * behaviour and the "never auto-apply" rule live in one place.
 */
export function FxRateButton({
  currency,
  date,
  onRate,
  compact,
}: {
  /** The PRINTED currency of the record. Blank / base currency = nothing to look up. */
  currency: string;
  /** The record's own day (YYYY-MM-DD) for a historical fixing; omit for the latest. */
  date?: string;
  onRate: (rate: number) => void;
  /** Icon-only, for the tight inline row in the /reports audit panel. */
  compact?: boolean;
}) {
  const t = useT();
  const [pending, start] = useTransition();
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const code = normalizeCurrency(currency);

  function fetchRate() {
    if (!code) return;
    setError('');
    setNote('');
    start(async () => {
      const res = await lookupMarketRate(code, date);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onRate(res.rate);
      setNote(res.date ? t('fx.rateAsOf', { date: res.date }) : '');
    });
  }

  if (!code) return null;

  return (
    <span className="inline-flex items-center gap-1.5 min-w-0">
      <button
        type="button"
        onClick={fetchRate}
        disabled={pending}
        title={t('fx.marketRateHint')}
        className={cn(
          'inline-flex items-center gap-1 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface)] text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)] hover:border-[color:var(--color-purple)]/50 disabled:opacity-40 whitespace-nowrap',
          compact ? 'px-1.5 py-1 text-[10px]' : 'px-2 py-1 text-[11px]'
        )}
      >
        <RefreshCw size={11} className={pending ? 'animate-spin' : undefined} />
        {!compact && t('fx.marketRate')}
      </button>
      {error ? (
        <span className="text-[10px] text-[color:var(--color-red)] truncate" title={error}>
          {error}
        </span>
      ) : note ? (
        <span
          className="text-[10px] text-[color:var(--color-text-faint)] truncate"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          {note}
        </span>
      ) : null}
    </span>
  );
}
