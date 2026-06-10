/**
 * PDF text extraction using pdfjs-dist legacy build (pure JS, no native deps,
 * works inside the Docker container). Used for credit-card statements.
 *
 * Reconstructs visual LINES from each text item's position (transform x/y)
 * instead of naively concatenating items. Credit-card statements are tables —
 * keeping "date  description  amount" together per row is what lets the model
 * read installments and amounts correctly.
 */
type PositionedItem = { x: number; y: number; str: string };

function reconstructLines(items: PositionedItem[]): string {
  if (items.length === 0) return '';
  // Top-to-bottom, then left-to-right.
  items.sort((a, b) => b.y - a.y || a.x - b.x);

  const lines: PositionedItem[][] = [];
  let current: PositionedItem[] = [];
  let lineY: number | null = null;
  const Y_TOL = 3; // items within ~3 user-units share a visual line

  for (const it of items) {
    if (lineY === null || Math.abs(it.y - lineY) <= Y_TOL) {
      current.push(it);
      if (lineY === null) lineY = it.y;
    } else {
      lines.push(current);
      current = [it];
      lineY = it.y;
    }
  }
  if (current.length) lines.push(current);

  return lines
    .map((line) =>
      line
        .sort((a, b) => a.x - b.x)
        .map((i) => i.str)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
    )
    .filter(Boolean)
    .join('\n');
}

export async function extractPdfText(buffer: Buffer): Promise<string> {
  // Legacy build runs in Node without a DOM / worker.
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');

  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    isEvalSupported: false,
    disableFontFace: true,
  });

  const doc = await loadingTask.promise;
  const pages: string[] = [];

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const items: PositionedItem[] = [];
    for (const item of content.items) {
      if (!('str' in item) || !item.str) continue;
      // transform = [a, b, c, d, e, f]; e = x, f = y in PDF user space.
      const t = item.transform as number[];
      items.push({ x: t[4], y: t[5], str: item.str });
    }
    const text = reconstructLines(items);
    if (text) pages.push(text);
  }

  await doc.destroy();
  return pages.join('\n\n');
}

export function looksLikeScannedPdf(text: string): boolean {
  // Almost no extractable text → probably an image-only (scanned) PDF
  return text.replace(/\s/g, '').length < 40;
}
