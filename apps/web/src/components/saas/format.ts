import { formatCurrency } from '@/lib/i18n/format';
// Display formatting helpers for the SaaS superadmin console. PURE + client-safe (no DB, no
// next/*, no node builtins) so they can be unit-tested and used from either server or client
// components. All defensive: non-finite / negative inputs render a sane zero rather than
// "NaN"/"-1 B", because these feed an operator dashboard where a garbled number reads as a
// real (alarming) value.

/** Thousands-grouped integer. Non-finite → "0". Rounds to the nearest whole number. */
export function formatInt(n: unknown): string {
  const v = Number(n);
  if (!Number.isFinite(v)) return '0';
  return Math.round(v).toLocaleString('en-US');
}

/**
 * Human byte size (B/KB/MB/GB/TB/PB, base-1024). Non-finite or ≤0 → "0 B". One decimal for
 * KB..PB below 100, whole numbers for bytes and for values ≥100 in a unit.
 */
export function formatBytes(bytes: unknown): string {
  const v = Number(bytes);
  if (!Number.isFinite(v) || v <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  let i = 0;
  let n = v;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  const digits = i === 0 || n >= 100 ? 0 : 1;
  return `${n.toFixed(digits)} ${units[i]}`;
}

/**
 * Currency amount stored as micros (1 unit = 1,000,000 micros — the aiCostMicros convention).
 * Non-finite or negative → 0. Rendered with the given ISO currency (default USD). Small
 * amounts keep more precision so sub-cent AI costs don't collapse to "$0.00".
 */
export function formatCostMicros(micros: unknown, currency = 'USD', locale = 'en'): string {
  let v = Number(micros);
  if (!Number.isFinite(v) || v < 0) v = 0;
  const amount = v / 1_000_000;
  const fractionDigits = amount > 0 && amount < 1 ? 4 : 2;
  try {
    return formatCurrency(amount, currency, locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: fractionDigits,
    });
  } catch {
    // Unknown currency code → fall back to a plain number so we never throw in render.
    return new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
  }
}

/** Format an ISO timestamp for the operator console; invalid/empty → "—". */
export function formatWhen(iso: unknown): string {
  if (typeof iso !== 'string' || !iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
