import { describe, expect, it } from 'vitest';
import { extractPdfText } from './pdf';

// Runs the REAL pdfjs-dist (no mock) over a tiny hand-built PDF, so a pdfjs upgrade that changes
// the loading options, the teardown, or the text-item shape fails here instead of on the first
// statement a user uploads (#175). The PDF places its words out of order on purpose: the
// extractor has to rebuild each visual row from the item positions.

function buildPdf(ops: string): Buffer {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 400] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(ops)} >>\nstream\n${ops}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(out));
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) out += `${String(o).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

const word = (x: number, y: number, s: string) => `BT /F1 12 Tf ${x} ${y} Td (${s}) Tj ET`;

describe('extractPdfText (real pdfjs)', () => {
  it('rebuilds table rows top-to-bottom, left-to-right', async () => {
    const pdf = buildPdf(
      [
        word(400, 300, '12.50'), // row 1, drawn right-to-left
        word(50, 300, '01/09'),
        word(150, 300, 'Coffee'),
        word(150, 280, 'Groceries'), // row 2, 20 units lower
        word(400, 280, '48.20'),
        word(50, 280, '02/09'),
      ].join('\n')
    );
    expect(await extractPdfText(pdf)).toBe('01/09 Coffee 12.50\n02/09 Groceries 48.20');
  });
});
