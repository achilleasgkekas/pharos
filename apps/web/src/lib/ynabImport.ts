// Pure YNAB "Register.csv" export → Pharos expense/income rows (P16, migration
// importers). Builds on the generic bank-CSV primitives (parseCsv/parseCsvDate/
// parseCsvAmount from lib/csvImport.ts) rather than a new parser — YNAB's export
// is just a CSV with YNAB-specific column semantics (separate Outflow/Inflow
// columns instead of one signed amount, Payee instead of vendor, Memo instead of
// notes). The mapped rows feed straight into the EXISTING, already-tested
// `importExpensesCsv(rows, {signSplit:true})` action (app/expenses/actions.ts) —
// no new dedupe/category-inheritance/DB code, just a different front door onto it.
//
// Tolerant, keyword-based column detection (not a hardcoded header order) so it
// copes with both the modern web app export ("Category Group/Category") and the
// legacy YNAB4 desktop export ("Master Category"/"Sub Category"). Two real-world
// concerns a naive mapper would get financially WRONG:
//   - "Starting Balance" / "Reconciliation Balance Adjustment" rows are YNAB
//     bookkeeping, not real transactions — importing them would inject a huge
//     fake income/expense.
//   - "Transfer : <account>" rows move money between the user's own YNAB
//     accounts — importing them as income+expense would double-count spend.
// Both are detected and excluded, counted separately from parse failures.

import { parseCsv, parseCsvAmount, parseCsvDate, type CsvParsedRow } from './csvImport';

export type YnabMapping = {
  date: number;
  payee: number;
  outflow: number;
  inflow: number;
  category: number; // -1 if no category-ish column was found
  memo: number; // -1 if no memo-ish column was found
};

/** First column index whose lowercased header matches `test`, or -1. */
function findCol(lower: string[], test: (h: string) => boolean): number {
  return lower.findIndex(test);
}

/**
 * Detect a YNAB register export from its header row. Requires Date + Payee +
 * at least one of Outflow/Inflow — anything less isn't confidently a YNAB
 * export, so callers should show "doesn't look like a YNAB file" rather than
 * silently mis-importing a different CSV.
 */
export function detectYnabColumns(header: string[]): YnabMapping | null {
  const lower = header.map((h) => h.trim().toLowerCase());
  const date = findCol(lower, (h) => h.includes('date'));
  const payee = findCol(lower, (h) => h.includes('payee'));
  const outflow = findCol(lower, (h) => h.includes('outflow'));
  const inflow = findCol(lower, (h) => h.includes('inflow'));
  if (date < 0 || payee < 0 || (outflow < 0 && inflow < 0)) return null;

  // Category: prefer the modern combined "Category Group/Category" header; else
  // the first plain "…category…" column that isn't itself a "…group…" column
  // (so legacy "Master Category" wins over an absent split, "Sub Category" over
  // neither); else whatever contains "category" at all. Best-effort only — a
  // wrong category label here is not a validity error, just a label to fix.
  const combo = findCol(lower, (h) => h.includes('category') && h.includes('group') && h.includes('/'));
  const plain = findCol(lower, (h) => h.includes('category') && !h.includes('group'));
  const any = findCol(lower, (h) => h.includes('category'));
  const category = combo >= 0 ? combo : plain >= 0 ? plain : any;

  const memo = findCol(lower, (h) => h.includes('memo'));

  return { date, payee, outflow, inflow, category, memo };
}

const TRANSFER_RE = /^transfer\s*:/i;
const BALANCE_ADJUSTMENT_RE = /^(starting balance|reconciliation balance adjustment)$/i;

export type YnabMapResult = {
  rows: CsvParsedRow[];
  /** Rows with no usable date/amount/payee. */
  invalid: number;
  /** Rows deliberately excluded: inter-account transfers + opening-balance entries. */
  excluded: number;
};

/** Map YNAB data rows (header already stripped) to Pharos CSV-import rows. */
export function mapYnabRows(rows: string[][], mapping: YnabMapping): YnabMapResult {
  const out: CsvParsedRow[] = [];
  let invalid = 0;
  let excluded = 0;

  const cell = (r: string[], i: number) => (i >= 0 ? (r[i] || '').trim() : '');

  for (const r of rows) {
    const payee = cell(r, mapping.payee);
    if (TRANSFER_RE.test(payee) || BALANCE_ADJUSTMENT_RE.test(payee)) {
      excluded++;
      continue;
    }

    const date = parseCsvDate(cell(r, mapping.date));
    const outflow = parseCsvAmount(cell(r, mapping.outflow));
    const inflow = parseCsvAmount(cell(r, mapping.inflow));
    const amount = outflow && outflow > 0 ? -outflow : inflow && inflow > 0 ? inflow : null;

    if (!date || amount === null || !payee) {
      invalid++;
      continue;
    }

    out.push({
      date,
      amount,
      vendor: payee,
      category: cell(r, mapping.category),
      notes: cell(r, mapping.memo),
      // A YNAB register export is denominated in the budget's own currency and never
      // prints a code per row, so it always imports as the base currency (P9).
      currency: '',
    });
  }

  return { rows: out, invalid, excluded };
}

/** Convenience: parse raw YNAB CSV text end to end. Returns `null` for
 *  `mapping` when the file's header doesn't look like a YNAB register export. */
export function parseYnabCsv(text: string): { mapping: YnabMapping | null; result: YnabMapResult } {
  const parsed = parseCsv(text);
  if (parsed.length === 0) return { mapping: null, result: { rows: [], invalid: 0, excluded: 0 } };
  const mapping = detectYnabColumns(parsed[0]);
  if (!mapping) return { mapping: null, result: { rows: [], invalid: 0, excluded: 0 } };
  return { mapping, result: mapYnabRows(parsed.slice(1), mapping) };
}
