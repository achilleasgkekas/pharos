import { describe, it, expect } from 'vitest';
import { buildInsuranceCsv, buildInsuranceHtml, type InsuranceItem } from './insuranceExport';

function item(overrides: Partial<InsuranceItem> = {}): InsuranceItem {
  return {
    id: 'i1',
    title: 'RTX 5080',
    category: 'compute',
    serialNumber: 'SN123',
    location: 'Battle Station',
    purchasedAt: '2026-03-15T00:00:00.000Z',
    purchasedFrom: 'TechLamb',
    warrantyUntil: '2028-03-15T00:00:00.000Z',
    value: 1443.72,
    photoFiles: [],
    attachmentFiles: [],
    receiptFiles: [],
    ...overrides,
  };
}

describe('buildInsuranceCsv', () => {
  it('emits a header row + one row per item with cent-precision value', () => {
    const csv = buildInsuranceCsv([item()]);
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('Title,Category,Serial,Location,Purchased,Purchased from,Estimated value,Warranty until,Photos,Documents,Receipts');
    expect(lines[1]).toBe('RTX 5080,compute,SN123,Battle Station,2026-03-15,TechLamb,1443.72,2028-03-15,0,0,0');
  });

  it('returns just the header for an empty list', () => {
    const csv = buildInsuranceCsv([]);
    expect(csv.split('\r\n')).toHaveLength(1);
  });

  it('counts attached files per item', () => {
    const csv = buildInsuranceCsv([
      item({
        photoFiles: ['a.jpg', 'b.jpg'],
        attachmentFiles: [{ file: 'manual.pdf', name: 'Manual' }],
        receiptFiles: [{ file: 'r1.pdf', store: 'TechLamb', date: '2026-03-15' }],
      }),
    ]);
    const cols = csv.split('\r\n')[1].split(',');
    expect(cols.slice(-3)).toEqual(['2', '1', '1']);
  });

  it('handles null dates and blank fields', () => {
    const csv = buildInsuranceCsv([item({ purchasedAt: null, warrantyUntil: null, serialNumber: '', location: '' })]);
    const cols = csv.split('\r\n')[1].split(',');
    expect(cols[2]).toBe(''); // serial
    expect(cols[3]).toBe(''); // location
    expect(cols[4]).toBe(''); // purchased
    expect(cols[7]).toBe(''); // warranty
  });

  it('CSV-injection-guards a leading formula character (same convention as toCSV)', () => {
    const csv = buildInsuranceCsv([item({ title: '=SUM(A1)', purchasedFrom: '+cmd' })]);
    const first = csv.split('\r\n')[1];
    expect(first).toContain("'=SUM(A1)");
    expect(first).toContain("'+cmd");
  });

  it('quotes fields containing commas or quotes', () => {
    const csv = buildInsuranceCsv([item({ title: 'Mouse, Keyboard "combo"' })]);
    expect(csv.split('\r\n')[1]).toContain('"Mouse, Keyboard ""combo"""');
  });
});

describe('buildInsuranceHtml', () => {
  it('includes the item title, formatted value, and totals', () => {
    const html = buildInsuranceHtml([item(), item({ id: 'i2', title: 'U7 Pro', value: 284 })], {
      generatedAt: '2026-07-20',
      currencySymbol: '€',
    });
    expect(html).toContain('RTX 5080');
    expect(html).toContain('U7 Pro');
    expect(html).toContain('€1443.72');
    expect(html).toContain('2 items');
    expect(html).toContain('€1727.72'); // total = 1443.72 + 284
  });

  it('singularizes the item count for exactly one item', () => {
    const html = buildInsuranceHtml([item()], { generatedAt: '2026-07-20', currencySymbol: '€' });
    expect(html).toContain('1 item ');
  });

  it('references photo/attachment/receipt files under files/<id>/', () => {
    const html = buildInsuranceHtml(
      [
        item({
          id: 'abc',
          photoFiles: ['photo_0.jpg'],
          attachmentFiles: [{ file: 'manual.pdf', name: 'User manual' }],
          receiptFiles: [{ file: 'receipt_0.pdf', store: 'TechLamb', date: '2026-03-15' }],
        }),
      ],
      { generatedAt: '2026-07-20', currencySymbol: '€' }
    );
    expect(html).toContain('src="files/abc/photo_0.jpg"');
    expect(html).toContain('href="files/abc/manual.pdf"');
    expect(html).toContain('User manual');
    expect(html).toContain('href="files/abc/receipt_0.pdf"');
    expect(html).toContain('Receipt · TechLamb · 2026-03-15');
  });

  it('escapes HTML-significant characters in item fields', () => {
    const html = buildInsuranceHtml([item({ title: '<script>alert(1)</script>' })], { generatedAt: '2026-07-20', currencySymbol: '€' });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('renders "—" placeholders when serial/warranty/docs are absent', () => {
    const html = buildInsuranceHtml([item({ serialNumber: '', warrantyUntil: null })], { generatedAt: '2026-07-20', currencySymbol: '€' });
    expect(html).toContain('<td>—</td>'); // serial
  });
});
