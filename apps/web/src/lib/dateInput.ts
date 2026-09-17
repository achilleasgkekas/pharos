// Locale-aware date entry for <DateInput>. A native <input type="date"> is drawn by the
// browser in the OPERATING SYSTEM's locale, not the app's (Chrome ignores `lang`), so an
// en_US Mac shows MM/DD/YYYY inside a Greek UI (#3). The component renders a plain text
// field instead and these pure helpers do the locale work. The value crossing the
// component boundary stays ISO `YYYY-MM-DD`, so forms and server actions do not change.

export type DatePart = 'day' | 'month' | 'year';

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

// The app's `en` means British English: every other date in the UI is formatted `en-GB`
// (DD/MM). Letting bare `en` resolve to US order here would make this one field disagree
// with the dates printed right next to it.
function intlLocale(locale: string): string {
  return locale === 'en' ? 'en-GB' : locale;
}

/** Field order and separator the locale prints numeric dates with, read from Intl, never hardcoded. */
export function dateLayout(locale: string): { order: DatePart[]; separator: string } {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat(intlLocale(locale), {
      year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'UTC',
    }).formatToParts(new Date(Date.UTC(2026, 11, 31)));
  } catch {
    // Unknown locale tag: fall back to the app default rather than throwing inside a form.
    return { order: ['day', 'month', 'year'], separator: '/' };
  }
  const order = parts
    .map((p) => p.type)
    .filter((t): t is DatePart => t === 'day' || t === 'month' || t === 'year');
  const literal = parts.find((p) => p.type === 'literal')?.value.trim() || '/';
  return order.length === 3 ? { order, separator: literal } : { order: ['day', 'month', 'year'], separator: '/' };
}

function isRealDate(y: number, m: number, d: number): boolean {
  if (y < 1000 || y > 9999 || m < 1 || m > 12 || d < 1) return false;
  // Day 0 of the next month is the last day of this one, which handles leap years for free.
  return d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** ISO `YYYY-MM-DD` → the locale's display form (`17/09/2026`). Empty or invalid input → ''. */
export function formatIsoDate(iso: string, locale: string): string {
  const m = ISO_RE.exec(iso ?? '');
  if (!m || !isRealDate(+m[1], +m[2], +m[3])) return '';
  const byPart: Record<DatePart, string> = { year: m[1], month: m[2], day: m[3] };
  const { order, separator } = dateLayout(locale);
  return order.map((p) => byPart[p]).join(separator);
}

/**
 * Typed text → ISO `YYYY-MM-DD`. Returns '' for blank text and null when the text is not a
 * real calendar date. Any non-digit run separates the fields, so `17.9.2026` and `17-09-2026`
 * both work in a Greek UI. The year must have four digits: guessing the century of `26` is
 * exactly the kind of silent reinterpretation this component exists to remove.
 */
export function parseLocaleDate(text: string, locale: string): string | null {
  const trimmed = (text ?? '').trim();
  if (!trimmed) return '';
  const nums = trimmed.split(/\D+/).filter(Boolean);
  if (nums.length !== 3) return null;
  const { order } = dateLayout(locale);
  const got = {} as Record<DatePart, string>;
  order.forEach((p, i) => { got[p] = nums[i]; });
  if (got.year.length !== 4 || got.month.length > 2 || got.day.length > 2) return null;
  const y = +got.year, mo = +got.month, d = +got.day;
  if (!isRealDate(y, mo, d)) return null;
  return `${got.year}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Placeholder such as `DD/MM/YYYY`, built from the locale's own order with translated field letters. */
export function datePlaceholder(locale: string, letters: Record<DatePart, string>): string {
  const { order, separator } = dateLayout(locale);
  return order.map((p) => letters[p]).join(separator);
}
