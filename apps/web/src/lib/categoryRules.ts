// Vendor→category auto-rules (P15). A deterministic rules engine: "if the vendor /
// description matches X → categorise as Y (and optionally mark it recurring)". Runs on
// every new expense/income the moment it is created (scan, manual, CSV import), with
// ZERO AI cost — pure string matching, offline, free everywhere. The user manages the
// rule list from Settings → Money; matching reuses the same vendorKey normalization the
// recurring-series grouping uses, so "ΔΕΗ", "δεη", "PPC / ΔΕΗ" all hit one "dei" rule.
//
// Framework-free + DB-free so it unit-tests without Mongo and stores nothing but the
// rule array on the AppConfig singleton.

import { vendorKey } from '@/app/expenses/lib';
import { RECURRING_CYCLES, type RecurringCycle } from '@/lib/billingCycle';

export type { RecurringCycle } from '@/lib/billingCycle';

export type CategoryRule = {
  /** Stable-ish id for React keys / edits (derived from match+category when absent). */
  id: string;
  /** The pattern the user typed (a vendor-name fragment, or a raw substring). */
  match: string;
  /**
   * How `match` is compared:
   *  - 'vendor' (default): normalize both sides via vendorKey and test containment,
   *    so accents/legal-suffixes/spacing don't matter (the recommended, forgiving mode).
   *  - 'text': plain case-insensitive substring over "vendor + description" (advanced,
   *    for matching a phrase in the notes rather than the vendor name).
   */
  matchType: 'vendor' | 'text';
  /** Category to assign when the rule matches. */
  category: string;
  /** When true, also mark the record recurring (a rule can force a series on). */
  recurring: boolean;
  /** Cycle to set when `recurring` (empty = leave as-is / inherit). */
  recurringCycle: RecurringCycle;
};

// A rule may set any recurring cycle except "none" — leaving it empty already means
// "leave as-is", which is handled by the `|| ''` fallback, not by this set.
const CYCLES = new Set<string>(RECURRING_CYCLES.filter(Boolean));

function makeId(match: string, category: string, i: number): string {
  return `${vendorKey(match) || 'r'}-${vendorKey(category) || 'c'}-${i}`;
}

/**
 * Coerce a raw (Mixed) stored value into a clean, validated CategoryRule[]. Drops any
 * entry missing a match or category. Order is preserved — first matching rule wins.
 */
export function resolveCategoryRules(raw: unknown): CategoryRule[] {
  if (!Array.isArray(raw)) return [];
  const out: CategoryRule[] = [];
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>;
    const match = String(o.match ?? '').trim().slice(0, 80);
    const category = String(o.category ?? '').trim().slice(0, 60);
    if (!match || !category) continue;
    const cycleRaw = String(o.recurringCycle ?? '');
    out.push({
      id: (typeof o.id === 'string' && o.id) || makeId(match, category, out.length),
      match,
      matchType: o.matchType === 'text' ? 'text' : 'vendor',
      category,
      recurring: o.recurring === true,
      recurringCycle: (CYCLES.has(cycleRaw) ? cycleRaw : '') as RecurringCycle,
    });
  }
  return out;
}

export type CategoryRuleInput = { vendor?: string | null; description?: string | null };

/** First rule (in list order) that matches the vendor/description, or null. */
export function matchCategoryRule(rules: CategoryRule[], input: CategoryRuleInput): CategoryRule | null {
  if (!rules.length) return null;
  const vKey = vendorKey(input.vendor || '');
  const text = `${input.vendor || ''} ${input.description || ''}`.toLowerCase();
  for (const rule of rules) {
    if (rule.matchType === 'vendor') {
      const rk = vendorKey(rule.match);
      if (rk && vKey.includes(rk)) return rule;
    } else {
      const m = rule.match.toLowerCase().trim();
      if (m && text.includes(m)) return rule;
    }
  }
  return null;
}

/** Convenience: the category (+ recurring hints) a matching rule assigns, or null. */
export function categoryFromRules(
  rules: CategoryRule[],
  input: CategoryRuleInput,
): { category: string; recurring: boolean; recurringCycle: RecurringCycle } | null {
  const r = matchCategoryRule(rules, input);
  if (!r) return null;
  return { category: r.category, recurring: r.recurring, recurringCycle: r.recurringCycle };
}
