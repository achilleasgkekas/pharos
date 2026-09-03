/**
 * P70 — user-defined key/value attributes on an Item.
 *
 * Why this exists: an item already has a free `specs` text blob, but a blob is only
 * full-text searchable. A MAC address, a rack unit, a firmware revision or a licence key
 * typed into `specs` cannot be read back as "the MAC of this item" — it is just prose.
 * These are named attributes instead, so the value has a label attached to it.
 *
 * Keys are FREE STRINGS, the same relaxed-enum idiom Items already uses for categories:
 * no fixed schema, no admin list to maintain, whatever the user names it saves.
 *
 * Everything here is pure so the rules below are unit-testable and the same normalisation
 * runs no matter who writes the field (the form today, an importer later).
 *
 * The caps are not arbitrary strictness: this array is EMBEDDED in the item document and
 * the items page loads every owned item wholesale, so an unbounded list would be paid for
 * on every list render, not only on the detail view.
 */

export type CustomField = { key: string; value: string };

export const MAX_CUSTOM_FIELDS = 50;
export const MAX_KEY_LENGTH = 60;
export const MAX_VALUE_LENGTH = 500;

/**
 * Clean a raw list into what is safe to store.
 *
 * The rules, all deliberate:
 *  - an entry with no key is DROPPED — a value with no name is not an attribute, and
 *    silently keeping it would produce a blank row in the detail table;
 *  - an empty VALUE is kept, because "Serial: (not yet known)" is a real state and the
 *    user explicitly created that row;
 *  - duplicate keys collapse to the FIRST one (compared case-insensitively), so a second
 *    row can never shadow a value the user can see above it;
 *  - key and value are trimmed and truncated rather than rejected, so a long paste still
 *    saves the part that matters instead of failing the whole form.
 */
export function normalizeCustomFields(raw: unknown): CustomField[] {
  if (!Array.isArray(raw)) return [];
  const out: CustomField[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    const key = String(e.key ?? '').trim().slice(0, MAX_KEY_LENGTH);
    if (!key) continue;
    const dedupe = key.toLowerCase();
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    out.push({ key, value: String(e.value ?? '').trim().slice(0, MAX_VALUE_LENGTH) });
    if (out.length >= MAX_CUSTOM_FIELDS) break;
  }
  return out;
}

/** Form transport: the editor posts a JSON array, same as the links editor. */
export function parseCustomFields(json: string): CustomField[] {
  try {
    return normalizeCustomFields(JSON.parse(json));
  } catch {
    return [];
  }
}

/**
 * Does any attribute match the free-text search box? Both the NAME and the VALUE count,
 * so "mac" finds the field and "3c:22" finds the machine. This is the search box only —
 * a structured "filter by key = value" control is a separate, later step.
 */
export function customFieldsMatch(fields: CustomField[] | undefined | null, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q || !fields?.length) return false;
  return fields.some(
    (f) => f.key.toLowerCase().includes(q) || f.value.toLowerCase().includes(q)
  );
}
