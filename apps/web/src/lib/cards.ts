// Pure helpers for credit/debit card matching & display.
// Shared by statement import (auto-match/create) and the cards UI.

export type CardType = 'mastercard' | 'visa' | 'amex' | 'maestro' | 'other';

/** Keep only the final 4 digits of any card string ("**** 1234" → "1234"). */
export function normalizeLast4(raw?: string | null): string {
  if (!raw) return '';
  return String(raw).replace(/\D/g, '').slice(-4);
}

/** Best-effort card network from a free-text name. */
export function detectCardType(name: string): CardType {
  const n = (name || '').toLowerCase();
  if (n.includes('mastercard') || n.includes('master card')) return 'mastercard';
  if (n.includes('visa')) return 'visa';
  if (n.includes('amex') || n.includes('american express')) return 'amex';
  if (n.includes('maestro')) return 'maestro';
  return 'other';
}

/** Stable display label: name + last4 (without duplicating digits already in name). */
export function buildCardLabel(name?: string | null, last4?: string | null): string {
  const base = (name || 'Card').trim();
  const l4 = normalizeLast4(last4);
  if (l4 && !base.includes(l4)) return `${base} ${l4}`;
  return base;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** "2026-06" → "June 2026". Falls back to the raw string if malformed. */
export function periodLabel(period?: string | null): string {
  if (!period) return '';
  const m = period.match(/^(\d{4})-(\d{2})$/);
  if (!m) return period;
  const month = MONTHS[Number(m[2]) - 1];
  return month ? `${month} ${m[1]}` : period;
}
