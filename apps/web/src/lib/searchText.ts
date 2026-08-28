// Text matching for the in-app search boxes.
//
// Every list in the app used to filter with `haystack.toLowerCase().includes(query)`.
// That quietly fails on Greek, which is most of the real data here: Greek receipts and
// invoices are printed in CAPITALS, and Greek capitals are written WITHOUT accents,
// while the same word typed normally in lowercase HAS them. So "ΓΑΛΑ" lowercases to
// "γαλα" and never matches a search for "γάλα" — and vice versa. The user cannot see
// why; the item is right there on the receipt.
//
// fold() removes that whole class of misses: accents/diacritics are stripped (Greek and
// Latin alike, so "Café" matches "cafe"), case is normalised, and Greek final sigma is
// unified with medial sigma ("ΟΔΟΣ" vs "οδός" vs "οδοσ").

/**
 * Normalise text for comparison: lowercase, strip combining diacritics, unify final
 * sigma, and collapse whitespace. NFD splits an accented letter into base + combining
 * mark, so removing the marks leaves the plain letter behind.
 */
export function fold(s: unknown): string {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // combining accents (Greek tonos + Latin diacritics)
    .replace(/ς/g, 'σ') // final sigma ς → σ
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Split a query into search terms. Quoted runs ("γάλα φρέσκο") stay together as one
 * term, so an exact phrase is still expressible.
 */
export function queryTerms(query: string): string[] {
  const out: string[] = [];
  const re = /"([^"]*)"|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(query ?? '')) !== null) {
    const term = fold(m[1] ?? m[2]);
    if (term) out.push(term);
  }
  return out;
}

/**
 * Does `haystack` match every term in `query`? Terms are ANDed and may appear in any
 * order and any field, which is what people expect when they type "αβ γαλα": show the
 * receipt from ΑΒ that has milk on it, not only rows where those words happen to sit
 * next to each other in that order.
 *
 * An empty query matches everything, so callers can pass the raw input unconditionally.
 */
export function matchesQuery(haystack: string, query: string): boolean {
  const terms = queryTerms(query);
  if (terms.length === 0) return true;
  const hay = fold(haystack);
  return terms.every((t) => hay.includes(t));
}

/** Join arbitrary field values into one searchable blob, skipping empties. */
export function haystack(...parts: Array<unknown>): string {
  return parts
    .flat(2)
    .map((p) => (p === null || p === undefined || p === false ? '' : String(p)))
    .filter(Boolean)
    .join(' ');
}

/**
 * Do two labels mean the same thing once folded? Used to group the store names that
 * OCR produces in several spellings ("ΑΒ ΒΑΣΙΛΟΠΟΥΛΟΣ" / "ΑΒ Βασιλόπουλος") so a
 * per-store filter selects all of them instead of only the exact string clicked.
 */
export function sameLabel(a: string, b: string): boolean {
  return fold(a) === fold(b);
}

// ── Accent-tolerant regex, for the server-side (Mongo) search ─────────────────
// fold() cannot help a Mongo query: the documents are stored accented-or-not exactly
// as OCR produced them, and MongoDB's collation (which CAN ignore diacritics) is not
// applied to $regex matching. So the tolerance has to be built into the pattern
// itself — every vowel becomes a class covering its accented forms.

const VARIANTS: Record<string, string> = {
  α: 'αά', ε: 'εέ', η: 'ηή', ι: 'ιίϊΐ', ο: 'οό', υ: 'υύϋΰ', ω: 'ωώ', σ: 'σς',
  a: 'aáàâä', e: 'eéèêë', i: 'iíìîï', o: 'oóòôö', u: 'uúùûü', c: 'cç', n: 'nñ',
};

/**
 * Escape a query for use in a RegExp, then widen each letter to also match its
 * accented variants — so a Mongo `$regex` search for "γαλα" finds "ΓΑΛΑ" and "γάλα"
 * alike. Pair it with the 'i' flag for case.
 */
export function accentInsensitiveSource(query: string): string {
  const escaped = String(query ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let out = '';
  for (let i = 0; i < escaped.length; i++) {
    const ch = escaped[i];
    if (ch === '\\') { // keep an escape sequence intact
      out += ch + (escaped[++i] ?? '');
      continue;
    }
    // Fold the character to its base letter first, so an ALREADY-accented query
    // ("γάλα") widens to the same class as the unaccented one ("γαλα").
    const variants = VARIANTS[fold(ch)];
    out += variants ? `[${variants}]` : ch;
  }
  return out;
}
