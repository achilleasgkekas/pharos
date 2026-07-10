// Pure helpers for expenses — kept OUT of actions.ts because a 'use server' module
// may only export async functions.
import type { SerializedExpense } from '@/types';

const GREEK: Record<string, string> = {
  α: 'a', β: 'v', γ: 'g', δ: 'd', ε: 'e', ζ: 'z', η: 'i', θ: 'th', ι: 'i', κ: 'k', λ: 'l', μ: 'm',
  ν: 'n', ξ: 'x', ο: 'o', π: 'p', ρ: 'r', σ: 's', ς: 's', τ: 't', υ: 'y', φ: 'f', χ: 'ch', ψ: 'ps', ω: 'o',
};

/** Normalize a vendor name → a stable key so the SAME provider groups one recurring
 *  series (e.g. "ΔΕΗ", "δεη", "PPC / ΔΕΗ" → "dei"). Greek → latin, strip noise. */
export function vendorKey(vendor: string): string {
  return (vendor || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split('')
    .map((c) => GREEK[c] ?? c)
    .join('')
    .replace(/\b(a\.?e\.?|epe|ike|ltd|inc|gmbh|sa|the)\b/g, '')
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 40);
}

export function serializeExpense(e: Record<string, unknown>): SerializedExpense {
  const s = JSON.parse(JSON.stringify(e));
  return {
    _id: String(s._id),
    kind: s.kind === 'income' ? 'income' : 'expense',
    vendor: s.vendor ?? '',
    vendorKey: s.vendorKey ?? '',
    category: s.category ?? 'other',
    space: s.space ?? '',
    amount: s.amount ?? 0,
    currency: s.currency ?? 'EUR',
    date: s.date ?? '',
    period: s.period ?? '',
    recurring: !!s.recurring,
    recurringCycle: s.recurringCycle ?? '',
    filePath: s.filePath ?? '',
    fileType: s.fileType ?? '',
    thumbPath: s.thumbPath ?? '',
    fileSize: s.fileSize ?? 0,
    paymentMethod: s.paymentMethod ?? '',
    notes: s.notes ?? '',
    aiModel: s.aiModel ?? '',
    aiParsedAt: s.aiParsedAt ?? null,
    verified: !!s.verified,
    createdAt: s.createdAt ?? '',
    updatedAt: s.updatedAt ?? '',
  };
}
