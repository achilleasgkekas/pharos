// Pure helpers for expenses — kept OUT of actions.ts because a 'use server' module
// may only export async functions.
import type { SerializedExpense } from '@/types';
import type { SplitEntry } from '@/lib/split';
import type { PaymentSplitEntry } from '@/lib/paymentSplit';

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

/** #231: normalized key of a user-named series under one vendor ("iCloud" → "icloud"). The same
 *  normalizer as the vendor, so casing and accents never split one series in two. */
export function seriesKeyOf(series: string): string {
  return vendorKey(series);
}

/** One recurring series = kind + vendor + (optional) named series. Every place that groups a
 *  series (the generator, price-hike watch, the "in series" count) builds its key here. */
export function seriesGroupKey(e: { vendorKey?: string | null; seriesKey?: string | null }): string {
  const v = e.vendorKey || '';
  return e.seriesKey ? `${v}#${e.seriesKey}` : v;
}

export function serializeExpense(e: Record<string, unknown>): SerializedExpense {
  const s = JSON.parse(JSON.stringify(e));
  return {
    _id: String(s._id),
    kind: s.kind === 'income' ? 'income' : 'expense',
    vendor: s.vendor ?? '',
    vendorKey: s.vendorKey ?? '',
    series: s.series ?? '',
    seriesKey: s.seriesKey ?? '',
    category: s.category ?? 'other',
    space: s.space ?? '',
    taxDeductible: !!s.taxDeductible,
    taxCategory: s.taxCategory ?? '',
    amount: s.amount ?? 0,
    currency: s.currency ?? 'EUR',
    origAmount: s.origAmount ?? 0,
    fxRate: s.fxRate ?? 0,
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
    split: Array.isArray(s.split)
      ? (s.split as unknown[]).map((r): SplitEntry => {
          const e = r as Record<string, unknown>;
          return { name: String(e.name ?? ''), share: Number(e.share) || 0, settled: !!e.settled };
        })
      : [],
    paymentSplits: Array.isArray(s.paymentSplits)
      ? (s.paymentSplits as unknown[]).map((r): PaymentSplitEntry => {
          const p = r as Record<string, unknown>;
          return { method: String(p.method ?? ''), amount: Number(p.amount) || 0 };
        })
      : [],
    aiModel: s.aiModel ?? '',
    aiParsedAt: s.aiParsedAt ?? null,
    verified: !!s.verified,
    createdAt: s.createdAt ?? '',
    updatedAt: s.updatedAt ?? '',
  };
}
