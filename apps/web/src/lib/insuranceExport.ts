// Home-inventory insurance export bundle (P13). Pure, DB-free builders for the
// manifest that goes into the ZIP — a CSV (spreadsheet-friendly, for an insurer's
// claim form) and a standalone HTML report (opens in any browser, printable to
// PDF by the user — no PDF-writing dependency needed for v1) that references the
// item photos / manuals / receipts the caller has already copied into the ZIP
// under `files/<itemId>/...`. Actual file I/O (storage reads, JSZip assembly)
// lives in the settings server action; this module only formats text.

export type InsuranceItem = {
  id: string;
  title: string;
  category: string;
  serialNumber: string;
  location: string;
  purchasedAt: string | null; // ISO date or null
  purchasedFrom: string;
  warrantyUntil: string | null; // ISO date or null
  value: number; // already resolved (depreciation-adjusted where enabled)
  photoFiles: string[]; // filenames already placed under files/<id>/
  attachmentFiles: { file: string; name: string }[];
  receiptFiles: { file: string; store: string; date: string | null }[];
};

function csvEscape(v: string | number): string {
  let s = String(v ?? '');
  // CSV-injection guard, same convention as settings/actions.ts toCSV.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const isoDay = (d: string | null) => (d ? d.slice(0, 10) : '');

/** Spreadsheet manifest — one row per insured item, totals-friendly. */
export function buildInsuranceCsv(items: InsuranceItem[]): string {
  const headers = ['Title', 'Category', 'Serial', 'Location', 'Purchased', 'Purchased from', 'Estimated value', 'Warranty until', 'Photos', 'Documents', 'Receipts'];
  const rows = items.map((i) => [
    i.title,
    i.category,
    i.serialNumber,
    i.location,
    isoDay(i.purchasedAt),
    i.purchasedFrom,
    i.value.toFixed(2),
    isoDay(i.warrantyUntil),
    i.photoFiles.length,
    i.attachmentFiles.length,
    i.receiptFiles.length,
  ]);
  return [headers.map(csvEscape).join(','), ...rows.map((r) => r.map(csvEscape).join(','))].join('\r\n');
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Standalone HTML report — self-contained (inline styles, no external assets)
 *  so it opens correctly straight out of the ZIP and prints cleanly to PDF. */
export function buildInsuranceHtml(items: InsuranceItem[], opts: { generatedAt: string; currencySymbol: string }): string {
  const totalValue = items.reduce((sum, i) => sum + (i.value > 0 ? i.value : 0), 0);
  const cur = opts.currencySymbol;
  const rows = items
    .map((i) => {
      const photos = i.photoFiles.map((f) => `<img src="files/${esc(i.id)}/${esc(f)}" alt="${esc(i.title)}">`).join('');
      const docs = [...i.attachmentFiles.map((a) => ({ file: a.file, label: a.name || a.file })), ...i.receiptFiles.map((r) => ({ file: r.file, label: `Receipt · ${r.store}${r.date ? ` · ${isoDay(r.date)}` : ''}` }))]
        .map((d) => `<li><a href="files/${esc(i.id)}/${esc(d.file)}">${esc(d.label)}</a></li>`)
        .join('');
      return `
      <tr>
        <td>
          <strong>${esc(i.title)}</strong><br>
          <span class="muted">${esc(i.category)}${i.location ? ` · ${esc(i.location)}` : ''}</span>
          ${photos ? `<div class="photos">${photos}</div>` : ''}
        </td>
        <td>${esc(i.serialNumber) || '—'}</td>
        <td>${isoDay(i.purchasedAt) || '—'}${i.purchasedFrom ? `<br><span class="muted">${esc(i.purchasedFrom)}</span>` : ''}</td>
        <td>${isoDay(i.warrantyUntil) || '—'}</td>
        <td class="value">${cur}${i.value.toFixed(2)}</td>
        <td>${docs ? `<ul class="docs">${docs}</ul>` : '—'}</td>
      </tr>`;
    })
    .join('');

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Insurance / proof-of-ownership export</title>
<style>
  body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #111; margin: 24px; }
  h1 { font-size: 20px; margin-bottom: 2px; }
  .muted { color: #666; font-size: 12px; }
  .summary { margin: 12px 0 20px; font-size: 14px; }
  .summary strong { font-size: 18px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #ddd; vertical-align: top; }
  th { background: #f5f5f5; font-size: 11px; text-transform: uppercase; letter-spacing: 0.03em; color: #555; }
  .value { white-space: nowrap; font-weight: 600; }
  .photos { margin-top: 6px; display: flex; gap: 6px; flex-wrap: wrap; }
  .photos img { width: 64px; height: 64px; object-fit: cover; border-radius: 4px; border: 1px solid #ddd; }
  .docs { margin: 0; padding-left: 16px; font-size: 12px; }
  @media print { body { margin: 0; } }
</style></head>
<body>
  <h1>Home inventory · proof of ownership</h1>
  <p class="muted">Generated ${esc(opts.generatedAt)}</p>
  <p class="summary">${items.length} item${items.length === 1 ? '' : 's'} · Total insured value <strong>${cur}${totalValue.toFixed(2)}</strong></p>
  <table>
    <thead><tr><th>Item</th><th>Serial</th><th>Purchased</th><th>Warranty</th><th>Value</th><th>Attached files</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</body></html>`;
}
