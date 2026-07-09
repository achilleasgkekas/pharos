// Pure helpers for the bank/generic CSV import (expenses & income). Isomorphic —
// the client parses + maps + previews with these, the server action re-validates.
// No dependencies: bank exports are small enough that a hand-rolled RFC-4180
// parser (quotes, embedded newlines/delimiters, CRLF, BOM) is simpler than a lib.

export type CsvField = 'date' | 'amount' | 'vendor' | 'category' | 'notes';

/** Column index per logical field; -1 / undefined = not mapped. */
export type CsvMapping = Partial<Record<CsvField, number>>;

export type CsvParsedRow = {
  /** ISO yyyy-mm-dd */
  date: string;
  /** Signed as found in the file (negative = money out in most bank exports). */
  amount: number;
  vendor: string;
  category: string;
  notes: string;
};

export type CsvRowResult =
  | { ok: true; row: CsvParsedRow }
  | { ok: false; error: 'bad-date' | 'bad-amount' | 'no-vendor' };

/** Detect the delimiter by counting candidates on the first non-empty lines,
 *  ignoring anything inside double quotes. */
export function detectDelimiter(text: string): ',' | ';' | '\t' {
  const counts: Record<string, number> = { ',': 0, ';': 0, '\t': 0 };
  const lines = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 5);
  for (const line of lines) {
    let inQuotes = false;
    for (const ch of line) {
      if (ch === '"') inQuotes = !inQuotes;
      else if (!inQuotes && (ch === ',' || ch === ';' || ch === '\t')) counts[ch]++;
    }
  }
  if (counts[';'] > counts[','] && counts[';'] >= counts['\t']) return ';';
  if (counts['\t'] > counts[','] && counts['\t'] > counts[';']) return '\t';
  return ',';
}

/** RFC-4180 CSV → rows of cells. Handles quoted cells with embedded delimiters,
 *  escaped quotes ("") and newlines inside quotes. Strips a UTF-8 BOM. */
export function parseCsv(text: string, delimiter?: string): string[][] {
  const src = text.replace(/^\uFEFF/, '');
  const delim = delimiter || detectDelimiter(src);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++; }
        else inQuotes = false;
      } else cell += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delim) {
      row.push(cell); cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      rows.push(row); row = [];
    } else {
      cell += ch;
    }
  }
  if (cell !== '' || row.length > 0) { row.push(cell); rows.push(row); }
  // Drop fully-empty rows (trailing newlines, blank separator lines).
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

// Header keywords per field, checked as substrings of the lowercased header.
// Covers common English + Greek bank/export column names.
const HEADER_HINTS: Record<CsvField, string[]> = {
  date: ['date', 'ημερομ', 'ημ/νια', 'ημ/νία', 'valeur', 'datum', 'booking'],
  amount: ['amount', 'ποσο', 'ποσό', 'value', 'total', 'σύνολο', 'συνολο', 'betrag', 'debit', 'credit', 'χρεωση', 'χρέωση'],
  vendor: ['vendor', 'description', 'περιγραφ', 'merchant', 'payee', 'δικαιουχος', 'δικαιούχος', 'name', 'αιτιολογ', 'details', 'memo', 'επωνυμ'],
  category: ['category', 'κατηγορ'],
  notes: ['notes', 'σημει', 'comment', 'reference'],
};

/** Guess which column holds each field from the header row. First match wins;
 *  a column is only assigned once (e.g. "description" won't also become notes). */
export function guessMapping(header: string[]): CsvMapping {
  const mapping: CsvMapping = {};
  const taken = new Set<number>();
  for (const field of ['date', 'amount', 'vendor', 'category', 'notes'] as CsvField[]) {
    const hints = HEADER_HINTS[field];
    const idx = header.findIndex((h, i) => !taken.has(i) && hints.some((k) => h.toLowerCase().includes(k)));
    if (idx >= 0) { mapping[field] = idx; taken.add(idx); }
  }
  return mapping;
}

/** Does the first row look like a header (labels) rather than data?
 *  Heuristic: it maps to at least date+amount hints, or none of its cells
 *  parse as an amount or date while a later row does. */
export function looksLikeHeader(rows: string[][]): boolean {
  if (rows.length === 0) return false;
  const m = guessMapping(rows[0]);
  if (m.date !== undefined && m.amount !== undefined) return true;
  const first = rows[0];
  const firstHasData = first.some((c) => parseCsvAmount(c) !== null || parseCsvDate(c) !== null);
  if (firstHasData) return false;
  return rows.slice(1, 4).some((r) => r.some((c) => parseCsvAmount(c) !== null || parseCsvDate(c) !== null));
}

/** Parse an amount in EU ("1.234,56"), US ("1,234.56"), plain ("12.30" / "12,30"),
 *  parenthesised-negative ("(12.30)") or currency-prefixed ("€ 12,30") form.
 *  Returns null when the cell is not a number. */
export function parseCsvAmount(raw: string): number | null {
  let s = (raw || '').trim();
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1); }
  s = s.replace(/[€$£₺\s]|EUR|USD|GBP/gi, '');
  if (s.startsWith('-')) { negative = true; s = s.slice(1); }
  else if (s.startsWith('+')) s = s.slice(1);
  if (!s || !/^[\d.,]+$/.test(s)) return null;
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  if (lastDot >= 0 && lastComma >= 0) {
    // Both present → the LAST one is the decimal separator.
    if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (lastComma >= 0) {
    // Comma only: decimal if it looks like one ("12,30"), thousands if "1,234".
    const after = s.length - lastComma - 1;
    const commas = (s.match(/,/g) || []).length;
    if (commas === 1 && after !== 3) s = s.replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (lastDot >= 0) {
    const after = s.length - lastDot - 1;
    const dots = (s.match(/\./g) || []).length;
    // "1.234" (single dot, 3 digits after) is ambiguous; banks exporting EU
    // format use the comma for decimals, so treat it as thousands.
    if (dots > 1 || after === 3) s = s.replace(/\./g, '');
  }
  const n = Number(s);
  if (!isFinite(n)) return null;
  return negative ? -n : n;
}

/** Parse a date cell → ISO yyyy-mm-dd, or null. Accepts ISO, day-first EU
 *  (dd/mm/yyyy, dd-mm-yyyy, dd.mm.yyyy, 2-digit years) and yyyy/mm/dd. */
export function parseCsvDate(raw: string): string | null {
  const s = (raw || '').trim();
  if (!s) return null;
  const iso = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (iso) return isoOrNull(+iso[1], +iso[2], +iso[3]);
  const eu = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (eu) {
    let year = +eu[3];
    if (year < 100) year += year >= 70 ? 1900 : 2000;
    let day = +eu[1];
    let month = +eu[2];
    // Day-first by default (EU exports); swap only when day-first is impossible.
    if (month > 12 && day <= 12) { const t = day; day = month; month = t; }
    return isoOrNull(year, month, day);
  }
  return null;
}

function isoOrNull(year: number, month: number, day: number): string | null {
  if (year < 1970 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  // Reject rollovers like 31/02 → 03/03.
  if (d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Apply a mapping to one data row → a parsed row or a per-row error. */
export function mapCsvRow(cells: string[], mapping: CsvMapping): CsvRowResult {
  const cell = (f: CsvField) => (mapping[f] !== undefined && mapping[f]! >= 0 ? (cells[mapping[f]!] || '').trim() : '');
  const date = parseCsvDate(cell('date'));
  if (!date) return { ok: false, error: 'bad-date' };
  const amount = parseCsvAmount(cell('amount'));
  if (amount === null || amount === 0) return { ok: false, error: 'bad-amount' };
  const vendor = cell('vendor');
  if (!vendor) return { ok: false, error: 'no-vendor' };
  return { ok: true, row: { date, amount, vendor, category: cell('category'), notes: cell('notes') } };
}

/** Dedupe identity for an imported row: same kind + vendor + calendar day +
 *  absolute amount = the same transaction. Shared by client preview + server. */
export function csvDedupeKey(kind: 'income' | 'expense', vendorKey: string, dateIso: string, amount: number): string {
  return `${kind}|${vendorKey}|${dateIso.slice(0, 10)}|${Math.abs(amount).toFixed(2)}`;
}
