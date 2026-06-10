'use client';
import type { SerializedCard } from '@/types';

/** Stable display label for a card: "Mastercard 1234". */
export function cardLabel(c: Pick<SerializedCard, 'name' | 'last4'>): string {
  return `${c.name}${c.last4 ? ' ' + c.last4 : ''}`;
}

const selectClass =
  'w-full bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] rounded-lg px-4 py-2 text-sm text-[color:var(--color-text)] focus:outline-none focus:border-[color:var(--color-accent)] transition-colors';

/**
 * Payment-method picker backed by the globally managed cards. Keeps any legacy
 * free-text value selectable so old records don't lose their payment method.
 */
export function CardSelect({
  cards,
  value,
  onChange,
  placeholder = '— card / payment —',
}: {
  cards: SerializedCard[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const labels = cards.map(cardLabel);
  const hasCustom = value && !labels.includes(value);

  // No managed cards yet → plain text input so the field still works
  if (cards.length === 0) {
    return (
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="e.g. Mastercard 1234"
        className={selectClass}
      />
    );
  }

  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={selectClass}>
      <option value="">{placeholder}</option>
      {cards.map((c) => (
        <option key={c._id} value={cardLabel(c)}>
          {cardLabel(c)} · {c.kind}
        </option>
      ))}
      {hasCustom && <option value={value}>{value}</option>}
    </select>
  );
}
