import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);

/**
 * Rasterize page 1 of a PDF buffer to a JPEG thumbnail using poppler's
 * `pdftoppm` (installed in the Docker image). Returns null if poppler is missing
 * or the PDF can't be rendered — callers fall back to the file-type placeholder.
 */
export async function pdfFirstPageJpeg(pdf: Buffer, width = 480): Promise<Buffer | null> {
  const base = path.join(os.tmpdir(), `thumb_${crypto.randomBytes(6).toString('hex')}`);
  const inPdf = `${base}.pdf`;
  const out = `${base}.jpg`; // -singlefile appends .jpg
  try {
    await fs.writeFile(inPdf, pdf);
    await execFileP(
      'pdftoppm',
      ['-jpeg', '-singlefile', '-f', '1', '-l', '1', '-scale-to-x', String(width), '-scale-to-y', '-1', inPdf, base],
      { timeout: 20000 }
    );
    return await fs.readFile(out);
  } catch {
    return null;
  } finally {
    await fs.rm(inPdf, { force: true }).catch(() => {});
    await fs.rm(out, { force: true }).catch(() => {});
  }
}
