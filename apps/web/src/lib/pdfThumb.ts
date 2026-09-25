import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);

/**
 * Rasterize page 1 of a PDF buffer to a JPEG thumbnail using poppler's
 * `pdftoppm` (installed in the Docker image). Returns null if poppler is missing
 * or the PDF can't be rendered — callers fall back to the file-type placeholder.
 */
export async function pdfFirstPageJpeg(pdf: Buffer, width = 480): Promise<Buffer | null> {
  let dir = '';
  try {
    // A private (0700) directory, not a guessable name in the shared temp dir.
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'thumb-'));
    const base = path.join(dir, 'page');
    const inPdf = path.join(dir, 'in.pdf');
    const out = `${base}.jpg`; // -singlefile appends .jpg
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
    if (dir) await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
