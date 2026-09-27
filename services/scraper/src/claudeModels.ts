// The Claude models the price scraper may use, and the ones Anthropic has retired (#359).
//
// A copy of apps/web/src/lib/claudeModels.ts: the scraper is its own package and cannot import
// from the web app. apps/web/src/lib/claudeModels.test.ts fails when the two drift apart,
// so edit both together.
//
// Source: https://platform.claude.com/docs/en/about-claude/model-deprecations
// Requests to a retired model fail, so a saved retired id is swapped for its replacement.

/** Document parsing (receipts, statements, bills): reads images, returns JSON. */
export const CLAUDE_MAIN_DEFAULT = 'claude-sonnet-5';
/** The price scraper: plain text extraction, run unattended, so the low-cost model. */
export const CLAUDE_SCRAPER_DEFAULT = 'claude-haiku-4-5';

/** Chips under the main model field, before the live list is loaded. */
export const CLAUDE_SUGGESTIONS = ['claude-sonnet-5', 'claude-opus-5', 'claude-haiku-4-5'];
/** Chips under the Scraper AI model field. */
export const CLAUDE_SCRAPER_SUGGESTIONS = ['claude-haiku-4-5', 'claude-sonnet-5'];

type Rule = { match: RegExp; date: string; replacement: string };

/** Retired: requests fail. `date` is the retirement day. Checked in order. */
const RETIRED: Rule[] = [
  { match: /^claude-3-5-haiku(-|$)/, date: '2026-02-19', replacement: 'claude-haiku-4-5' },
  { match: /^claude-3-haiku(-|$)/, date: '2026-04-20', replacement: 'claude-haiku-4-5' },
  { match: /^claude-3-7-sonnet(-|$)/, date: '2026-02-19', replacement: 'claude-sonnet-5' },
  { match: /^claude-3-5-sonnet(-|$)/, date: '2025-10-28', replacement: 'claude-sonnet-5' },
  { match: /^claude-3-sonnet(-|$)/, date: '2025-07-21', replacement: 'claude-sonnet-5' },
  { match: /^claude-3-opus(-|$)/, date: '2026-01-05', replacement: 'claude-opus-5' },
  { match: /^claude-2(\.|-|$)/, date: '2025-07-21', replacement: 'claude-sonnet-5' },
  { match: /^claude-sonnet-4-(20250514|0)$/, date: '2026-06-15', replacement: 'claude-sonnet-5' },
  { match: /^claude-opus-4-(20250514|0)$/, date: '2026-06-15', replacement: 'claude-opus-5' },
  { match: /^claude-opus-4-1(-|$)/, date: '2026-08-05', replacement: 'claude-opus-5' },
];

/** Deprecated: still answers, retirement announced. `date` is the retirement day, '' = not announced. */
const DEPRECATED: Rule[] = [
  { match: /^claude-mythos-preview$/, date: '', replacement: 'claude-mythos-5-1' },
];

export type ModelLifecycle =
  | { status: 'active' }
  | { status: 'deprecated'; retiresOn: string; replacement: string }
  | { status: 'retired'; retiredOn: string; replacement: string };

/** Where a Claude model id stands. Anything not listed (including non-Claude ids) is active. */
export function modelLifecycle(id: string): ModelLifecycle {
  const m = (id || '').trim().toLowerCase();
  const retired = RETIRED.find((r) => r.match.test(m));
  if (retired) return { status: 'retired', retiredOn: retired.date, replacement: retired.replacement };
  const deprecated = DEPRECATED.find((r) => r.match.test(m));
  if (deprecated) return { status: 'deprecated', retiresOn: deprecated.date, replacement: deprecated.replacement };
  return { status: 'active' };
}

/** The id to actually call: a retired model is swapped for its replacement, anything else is kept. */
export function usableClaudeModel(id: string): string {
  const l = modelLifecycle(id);
  return l.status === 'retired' ? l.replacement : id;
}

/** Every rule's replacement, for tests: a replacement must never itself be retired. */
export const RETIREMENT_RULES: ReadonlyArray<{ pattern: string; date: string; replacement: string }> = RETIRED.map((r) => ({
  pattern: r.match.source,
  date: r.date,
  replacement: r.replacement,
}));
