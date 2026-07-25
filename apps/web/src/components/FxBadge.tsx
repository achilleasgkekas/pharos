'use client';
import { fxBadgeLabel, needsFxRate, normalizeCurrency } from '@/lib/fx';
import { cn } from '@/components/ui/cn';

/**
 * Foreign-currency chip (P9): what the document actually said, e.g. `$88.00 @ 0.92`.
 * Purple when a rate is known (the amount shown next to it IS converted); gold warning
 * when the rate is still missing, because then the number sitting in the app's totals is
 * a foreign one. Renders nothing for an ordinary base-currency document, so callers can
 * drop it in unconditionally. Structurally typed so expenses and receipts share it.
 */
export function FxBadge({
  doc,
  base,
}: {
  doc: { currency?: string | null; origAmount?: number | null; fxRate?: number | null };
  base: string;
}) {
  const label = fxBadgeLabel(doc, base);
  if (!label) return null;
  // Same rule the /reports "missing exchange rates" audit lists on, in one place.
  const known = !needsFxRate(doc, base);
  return (
    <span
      title={
        known
          ? `Converted to ${base} at ${doc.fxRate}`
          : `No ${base} rate yet — this total is still in ${normalizeCurrency(doc.currency)}`
      }
      className={cn(
        'text-[10px] font-bold rounded-md px-1.5 py-0.5 whitespace-nowrap',
        known
          ? 'text-[color:var(--color-purple)] bg-[color:var(--color-purple)]/10 border border-[color:var(--color-purple)]/30'
          : 'text-[color:var(--color-gold)] bg-[color:var(--color-gold)]/10 border border-[color:var(--color-gold)]/30'
      )}
      style={{ fontFamily: 'var(--font-mono)' }}
    >
      {known ? label : `${label} ⚠`}
    </span>
  );
}
