// Transliteration for subdomain labels — fold a human workspace name down to ASCII letters
// BEFORE the a-z0-9 filter in `slugify`, so a non-Latin name still produces a readable slug
// instead of an empty string (which drives the random `w-xxxxxx` fallback).
//
// PURE + isomorphic: no Node, no Mongoose, no React. Safe to import from anywhere.
//
// Approved by Achilleas 2026-07-28 (ask-inbox `pharos-saas-core-20260728-0038`, option b):
// «Πλαίσιο» must become `plaisio`, not `w-k3j9x1`, because the first customers will type a
// Greek workspace name and a random subdomain reads like a bug to them.
//
// NOTE on the duplicated table: an identical Greek→Latin map already lives in
// `app/settings/actions.ts` (added for store dedup). That file is a `'use server'` module, so
// every export must be an async server action — a plain const cannot be imported out of it.
// Copying 24 letters is the lesser evil versus reshaping a feature file from this routine.

/** Greek lowercase → Latin. Matches the store-dedup table so the two agree on 'β'→'v', 'η'→'i'. */
export const GREEK_MAP: Record<string, string> = {
  α: 'a', β: 'v', γ: 'g', δ: 'd', ε: 'e', ζ: 'z', η: 'i', θ: 'th', ι: 'i', κ: 'k', λ: 'l', μ: 'm',
  ν: 'n', ξ: 'x', ο: 'o', π: 'p', ρ: 'r', σ: 's', ς: 's', τ: 't', υ: 'y', φ: 'f', χ: 'ch', ψ: 'ps', ω: 'o',
};

/**
 * Lowercase, decompose, drop combining marks, then map Greek letters to Latin.
 *
 * Dropping the combining marks is what makes an accent DISAPPEAR rather than turn into a
 * hyphen: 'Müller' → 'muller' (previously 'mu-ller') and 'ά' → 'α' → 'a'. Scripts with no
 * entry here (Cyrillic, CJK) survive this step untouched and are dropped later by the a-z0-9
 * filter, exactly as before.
 */
export function transliterate(input: string): string {
  return (input || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // combining diacritics left by NFKD
    .split('')
    .map((ch) => GREEK_MAP[ch] ?? ch)
    .join('');
}
