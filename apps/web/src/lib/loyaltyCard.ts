// P20 — pure, DB-free helpers for the loyalty/membership card wallet. A card
// carries no monetary balance (distinct from GiftCard/P32) — it's just an ID
// that a checkout scanner reads off a barcode. Kept isolated so the format
// guess/validation is unit-testable and shared by the server action and the
// client's barcode renderer without pulling Mongoose or a DOM-only barcode lib.

export type BarcodeFormat = 'CODE128' | 'EAN13' | 'UPC' | 'CODE39';

export const BARCODE_FORMATS: readonly BarcodeFormat[] = ['CODE128', 'EAN13', 'UPC', 'CODE39'];

export function isBarcodeFormat(v: unknown): v is BarcodeFormat {
  return typeof v === 'string' && (BARCODE_FORMATS as readonly string[]).includes(v);
}

/** Best-guess barcode symbology from the card number's shape, so most cards
 *  need zero manual picking. EAN-13/UPC-A are fixed-length all-digit codes (the
 *  common case printed under supermarket/loyalty cards); anything else falls
 *  back to CODE128, which encodes any ASCII text. */
export function guessBarcodeFormat(cardNumber: string): BarcodeFormat {
  const v = String(cardNumber || '').trim();
  if (/^\d{13}$/.test(v)) return 'EAN13';
  if (/^\d{12}$/.test(v)) return 'UPC';
  return 'CODE128';
}

/** Resolve a stored/submitted format string to a real format, falling back to
 *  the shape-based guess when it's missing or not one we support. */
export function resolveBarcodeFormat(raw: unknown, cardNumber: string): BarcodeFormat {
  return isBarcodeFormat(raw) ? raw : guessBarcodeFormat(cardNumber);
}

/** Whether a card number is encodable in the given format — lets the UI warn
 *  before asking the barcode lib to render (which would otherwise throw). */
export function isValidForFormat(cardNumber: string, format: BarcodeFormat): boolean {
  const v = String(cardNumber || '').trim();
  if (!v) return false;
  switch (format) {
    case 'EAN13':
      return /^\d{13}$/.test(v);
    case 'UPC':
      return /^\d{12}$/.test(v);
    case 'CODE39':
      return /^[A-Z0-9\-. $/+%]+$/.test(v);
    case 'CODE128':
      return v.length <= 80; // printable text, generous cap
    default:
      return true;
  }
}
