// Year-end tax-deductible export bundle (P8). Pure, DB-free builders for the
// manifest that goes into the ZIP — a CSV (accountant/tax-software friendly)
// and a standalone HTML report grouped by tax category with a grand total,
// referencing the original bill/receipt files the caller has already copied
// into the ZIP under `files/<id>/<fileName>`. Mirrors lib/insuranceExport.ts
// (P13) — same idiom, same trade-off (no PDF-writing dependency; the HTML
// report is viewable + printable on its own). Actual file I/O (storage reads,
// JSZip assembly) lives in the settings server action; this module only
// formats text.

export type TaxExpenseRow = {
  id: string;
  date: string; // ISO date
  vendor: string;
  category: string;
  taxCategory: string; // '' = uncategorized
  amount: number;
  notes: string;
  fileName: string; // filename under files/<id>/ — '' when no file was attached
};

function csvEscape(v: string | number): string {
  let s = String(v ?? '');
  // CSV-injection guard, same convention as settings/actions.ts toCSV / insuranceExport.ts.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const isoDay = (d: string) => (d ? d.slice(0, 10) : '');

/** Spreadsheet manifest — one row per tax-deductible expense, ready for an accountant. */
export function buildTaxCsv(rows: TaxExpenseRow[]): string {
  const headers = ['Date', 'Vendor', 'Category', 'Tax category', 'Amount', 'Notes', 'File'];
  const body = rows.map((r) => [
    isoDay(r.date),
    r.vendor,
    r.category,
    r.taxCategory,
    r.amount.toFixed(2),
    r.notes,
    r.fileName ? 'yes' : '',
  ]);
  return [headers.map(csvEscape).join(','), ...body.map((r) => r.map(csvEscape).join(','))].join('\r\n');
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Standalone HTML report — grouped by tax category, self-contained (inline
 *  styles, no external assets) so it opens correctly straight out of the ZIP
 *  and prints cleanly to PDF/gives an accountant a quick per-category total. */
export function buildTaxHtml(rows: TaxExpenseRow[], opts: { year: number; generatedAt: string; currencySymbol: string }): string {
  const cur = opts.currencySymbol;
  const total = rows.reduce((sum, r) => sum + (r.amount || 0), 0);

  const groups = new Map<string, TaxExpenseRow[]>();
  for (const r of rows) {
    const key = r.taxCategory || 'Uncategorized';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }

  const sections = [...groups.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([name, items]) => {
      const subtotal = items.reduce((sum, r) => sum + (r.amount || 0), 0);
      const rowsHtml = items
        .map(
          (r) => `
      <tr>
        <td>${isoDay(r.date)}</td>
        <td>${esc(r.vendor) || '—'}</td>
        <td>${esc(r.category)}</td>
        <td class="value">${cur}${r.amount.toFixed(2)}</td>
        <td>${r.fileName ? `<a href="files/${esc(r.id)}/${esc(r.fileName)}">file</a>` : '—'}</td>
      </tr>`
        )
        .join('');
      return `
      <h2>${esc(name)} <span class="muted">· ${items.length} · ${cur}${subtotal.toFixed(2)}</span></h2>
      <table>
        <thead><tr><th>Date</th><th>Vendor</th><th>Category</th><th>Amount</th><th>File</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>`;
    })
    .join('');

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Tax export ${opts.year}</title>
<style>
  body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #111; margin: 24px; }
  h1 { font-size: 20px; margin-bottom: 2px; }
  h2 { font-size: 14px; margin: 24px 0 6px; }
  .muted { color: #666; font-weight: normal; font-size: 12px; }
  .summary { margin: 12px 0 20px; font-size: 14px; }
  .summary strong { font-size: 18px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: left; padding: 6px 10px; border-bottom: 1px solid #ddd; vertical-align: top; }
  th { background: #f5f5f5; font-size: 11px; text-transform: uppercase; letter-spacing: 0.03em; color: #555; }
  .value { white-space: nowrap; font-weight: 600; }
  @media print { body { margin: 0; } }
</style></head>
<body>
  <h1>Tax export · ${opts.year}</h1>
  <p class="muted">Generated ${esc(opts.generatedAt)}</p>
  <p class="summary">${rows.length} deductible expense${rows.length === 1 ? '' : 's'} · Total <strong>${cur}${total.toFixed(2)}</strong></p>
  ${sections || '<p class="muted">No tax-deductible expenses for this year.</p>'}
</body></html>`;
}
