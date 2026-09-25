import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import sharp from 'sharp';

const execFileP = promisify(execFile);

/** Run Tesseract OCR (Greek + English, single uniform block) on a file → text. */
async function runTesseract(file: string): Promise<string> {
  const { stdout } = await execFileP('tesseract', [file, 'stdout', '-l', 'ell+eng', '--psm', '6'], {
    timeout: 60000,
    maxBuffer: 16 * 1024 * 1024,
  });
  return stdout.trim();
}

/**
 * Detect page rotation with Tesseract OSD (`--psm 0`, needs osd.traineddata). Returns
 * the degrees the image must be rotated CLOCKWISE to be upright (0/90/180/270), or 0
 * if OSD is unavailable/uncertain. Sideways phone-photo receipts come out 90 or 270.
 */
async function detectRotation(file: string): Promise<number> {
  try {
    const { stdout } = await execFileP('tesseract', [file, 'stdout', '--psm', '0'], {
      timeout: 30000,
      maxBuffer: 4 * 1024 * 1024,
    });
    const m = stdout.match(/Rotate:\s*(\d+)/i);
    const deg = m ? parseInt(m[1], 10) : 0;
    return deg === 90 || deg === 180 || deg === 270 ? deg : 0;
  } catch {
    return 0; // osd.traineddata missing or OSD failed → assume upright
  }
}

/**
 * OCR a receipt image to plain text with Tesseract (Greek + English, installed in
 * the Docker image). Feeding the OCR'd text to the TEXT model is far more accurate
 * on dense Greek receipts than the small local vision model — it sidesteps the
 * weak visual reasoning of a 7B VLM. Returns '' if Tesseract is missing or fails,
 * so callers can fall back to the vision model.
 *
 * --psm 6 = treat the image as a single uniform block of text (good for receipts).
 */
export async function ocrImage(img: Buffer, ext = 'png'): Promise<string> {
  const safeExt = /^[a-z0-9]{1,5}$/i.test(ext) ? ext : 'png';
  let dir = '';
  try {
    // A private (0700) directory, not a guessable name in the shared temp dir.
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ocr-'));
    const inImg = path.join(dir, `in.${safeExt}`);
    const rotImg = path.join(dir, `rot.${safeExt}`);
    await fs.writeFile(inImg, img);
    // Sideways receipts (phone photos taken landscape) OCR to garbage. Detect the
    // rotation first; if upright, one OCR pass. If rotated, OCR a sharp-rotated copy
    // too and keep whichever reads better — so a wrong OSD call can't hurt an
    // already-upright receipt (the original wins on character count).
    const deg = await detectRotation(inImg);
    const original = await runTesseract(inImg);
    if (deg === 0) return original;

    let rotated = '';
    try {
      const rbuf = await sharp(img).rotate(deg).toBuffer();
      await fs.writeFile(rotImg, rbuf);
      rotated = await runTesseract(rotImg);
    } catch {
      /* rotation/OCR failed → fall back to the original */
    }
    const usable = (s: string) => s.replace(/\s/g, '').length;
    return usable(rotated) > usable(original) ? rotated : original;
  } catch {
    return '';
  } finally {
    if (dir) await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/** Enough real characters that the text model has something to parse. */
export function looksLikeUsableOcr(text: string): boolean {
  return text.replace(/\s/g, '').length >= 40;
}

/**
 * OCR every page of a PDF: rasterize each page to a 200-DPI JPEG with poppler's
 * pdftoppm, OCR it (Greek + English), and concatenate. For scanned/image-only
 * statements whose embedded text layer is missing or drops the installment
 * column — the rendered image often reads better than the broken text layer.
 * Capped at `maxPages` so a large PDF can't hang the request.
 */
export async function ocrPdf(pdf: Buffer, maxPages = 10): Promise<string> {
  const parts: string[] = [];
  let dir = '';
  try {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ocrpdf-'));
    const base = path.join(dir, 'page');
    const inPdf = path.join(dir, 'in.pdf');
    await fs.writeFile(inPdf, pdf);
    for (let page = 1; page <= maxPages; page++) {
      const prefix = `${base}_p${page}`;
      const out = `${prefix}.jpg`; // -singlefile appends .jpg
      try {
        await execFileP(
          'pdftoppm',
          ['-jpeg', '-r', '200', '-singlefile', '-f', String(page), '-l', String(page), inPdf, prefix],
          { timeout: 30000 }
        );
      } catch {
        break; // past the last page (or poppler missing)
      }
      let img: Buffer;
      try {
        img = await fs.readFile(out);
      } catch {
        break;
      }
      const t = await ocrImage(img, 'jpg');
      await fs.rm(out, { force: true }).catch(() => {});
      if (t.trim()) parts.push(t);
    }
    return parts.join('\n\n');
  } catch {
    return '';
  } finally {
    if (dir) await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
