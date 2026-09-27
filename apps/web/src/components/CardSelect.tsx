'use client';
import type { SerializedCard } from '@/types';
import { controlClass } from '@/components/ui/Input';

/** Stable display label for a card: "Mastercard 1234". */
export function cardLabel(c: Pick<SerializedCard, 'name' | 'last4'>): string {
  return `${c.name}${c.last4 ? ' ' + c.last4 : ''}`;
}

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
        className={controlClass}
      />
    );
  }

  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={controlClass}>
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
