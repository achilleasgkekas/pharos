import { describe, it, expect } from 'vitest';
import { buildTaxCsv, buildTaxHtml, type TaxExpenseRow } from './taxExport';

function row(overrides: Partial<TaxExpenseRow> = {}): TaxExpenseRow {
  return {
    id: 'e1',
    date: '2026-03-15T00:00:00.000Z',
    vendor: 'Dr. Papadopoulos',
    category: 'health',
    taxCategory: 'Ιατρικά έξοδα',
    amount: 84.5,
    notes: '',
    fileName: '',
    ...overrides,
  };
}

describe('buildTaxCsv', () => {
  it('emits a header row + one row per expense', () => {
    const csv = buildTaxCsv([row()]);
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('Date,Vendor,Category,Tax category,Amount,Notes,File');
    expect(lines[1]).toBe('2026-03-15,Dr. Papadopoulos,health,Ιατρικά έξοδα,84.50,,');
  });

  it('returns just the header for an empty list', () => {
    expect(buildTaxCsv([]).split('\r\n')).toHaveLength(1);
  });

  it('marks a "yes" File column only when a fileName is attached', () => {
    const csv = buildTaxCsv([row({ fileName: 'bill.pdf' })]);
    expect(csv.split('\r\n')[1].split(',').pop()).toBe('yes');
  });

  it('CSV-injection-guards a leading formula character', () => {
    const csv = buildTaxCsv([row({ vendor: '=SUM(A1)', notes: '+cmd' })]);
    const first = csv.split('\r\n')[1];
    expect(first).toContain("'=SUM(A1)");
    expect(first).toContain("'+cmd");
  });

  it('quotes fields containing commas or quotes', () => {
    const csv = buildTaxCsv([row({ vendor: 'Smith, "Doc"' })]);
    expect(csv.split('\r\n')[1]).toContain('"Smith, ""Doc"""');
  });
});

describe('buildTaxHtml', () => {
  it('includes the grand total and per-category subtotal', () => {
    const html = buildTaxHtml([row({ amount: 50 }), row({ id: 'e2', amount: 30 })], {
      year: 2026,
      generatedAt: '2026-07-20',
      currencySymbol: '€',
    });
    expect(html).toContain('Tax export · 2026');
    expect(html).toContain('€80.00'); // grand total
    expect(html).toContain('Ιατρικά έξοδα'); // group header
    expect(html).toContain('2 · €80.00'); // subtotal line (both rows share the category)
  });

  it('groups rows without a taxCategory under "Uncategorized"', () => {
    const html = buildTaxHtml([row({ taxCategory: '' })], { year: 2026, generatedAt: '2026-07-20', currencySymbol: '€' });
    expect(html).toContain('Uncategorized');
  });

  it('links to files/<id>/<fileName> only when a file is attached', () => {
    const html = buildTaxHtml([row({ id: 'abc', fileName: 'bill.pdf' })], { year: 2026, generatedAt: '2026-07-20', currencySymbol: '€' });
    expect(html).toContain('href="files/abc/bill.pdf"');
  });

  it('renders a friendly empty state when there are no rows', () => {
    const html = buildTaxHtml([], { year: 2026, generatedAt: '2026-07-20', currencySymbol: '€' });
    expect(html).toContain('No tax-deductible expenses for this year.');
    expect(html).toContain('0 deductible expenses'); // plural for n=0
  });

  it('singularizes the count for exactly one expense', () => {
    const html = buildTaxHtml([row()], { year: 2026, generatedAt: '2026-07-20', currencySymbol: '€' });
    expect(html).toContain('1 deductible expense ');
  });

  it('escapes HTML-significant characters in vendor/category', () => {
    const html = buildTaxHtml([row({ vendor: '<script>alert(1)</script>' })], { year: 2026, generatedAt: '2026-07-20', currencySymbol: '€' });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
