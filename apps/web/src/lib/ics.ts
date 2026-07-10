import type { AgendaEntry, AgendaMonth, AgendaKind } from '@/lib/moneyAgenda';

// Pure RFC 5545 (iCalendar) builder for the read-only money-agenda subscription feed.
// No DB, no I/O — takes computed agenda months and emits VCALENDAR text. All events
// are all-day (VALUE=DATE): financial deadlines are day-granular and this sidesteps
// VTIMEZONE entirely. Everything is deterministic given (agenda, dtstamp).

export type IcsEvent = { uid: string; date: Date; summary: string; description?: string; categories?: string[] };

/** Escape a TEXT value per RFC 5545 §3.3.11 (backslash, semicolon, comma, newline). */
export function escapeIcsText(s: string): string {
  return String(s)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\n|\r/g, '\\n');
}

/** Fold a content line to <=75 octets per RFC 5545 §3.1 (continuation = CRLF + space).
 *  Folds on UTF-8 byte boundaries so multi-byte chars (Greek) never split mid-codepoint. */
export function foldIcsLine(line: string): string {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let start = 0;
  let limit = 75; // first line: 75; continuations: 74 (leading space counts toward 75)
  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length);
    // Back off so we never cut a UTF-8 continuation byte (0b10xxxxxx).
    while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--;
    out.push(bytes.subarray(start, end).toString('utf8'));
    start = end;
    limit = 74;
  }
  return out.join('\r\n ');
}

/** UTC all-day date stamp YYYYMMDD — formatted from the instant's LOCAL calendar day
 *  (agenda dates are built at local midnight, so local components give the intended day). */
export function formatIcsDate(d: Date): string {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

/** UTC date-time stamp YYYYMMDDTHHMMSSZ (for DTSTAMP). */
export function formatIcsDateTime(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
}

const nextDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);

// Small stable string hash (djb2) → hex, so UIDs stay identical across regenerations
// of the same event (calendar clients then UPDATE rather than duplicate).
function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(16);
}

const KIND_LABEL: Record<AgendaKind, string> = {
  renewal: 'Renewal',
  installments: 'Installments',
  bill: 'Bill',
  income: 'Income',
  warranty: 'Warranty',
  voucher: 'Voucher',
};

function currencySymbol(code: string): string {
  return ({ EUR: '€', USD: '$', GBP: '£', JPY: '¥' } as Record<string, string>)[code] || '';
}

function fmtAmount(amount: number, currency: string): string {
  const sym = currencySymbol(currency);
  const n = amount.toFixed(2);
  return sym ? `${sym}${n}` : `${n} ${currency}`;
}

/** Map computed agenda months to flat all-day iCal events with a `[Category]` summary
 *  prefix and a stable UID per event. */
export function agendaToIcsEvents(months: AgendaMonth[], currency = 'EUR'): IcsEvent[] {
  const events: IcsEvent[] = [];
  for (const m of months) {
    for (const e of m.entries as AgendaEntry[]) {
      const d = new Date(e.date);
      const kindLabel = KIND_LABEL[e.kind] || 'Event';
      const money = e.amount != null ? ` — ${fmtAmount(e.amount, currency)}` : '';
      const summary = `[${kindLabel}] ${e.label}${money}`;
      const uid = `${e.kind}-${formatIcsDate(d)}-${hash(`${e.label}|${e.sub}|${e.amount ?? ''}`)}@pharos.local`;
      events.push({ uid, date: d, summary, description: e.sub || undefined, categories: ['Pharos', e.kind] });
    }
  }
  return events;
}

/** Build a full VCALENDAR document (CRLF-terminated, folded) from all-day events. */
export function buildIcsCalendar(
  events: IcsEvent[],
  opts: { name: string; description?: string; dtstamp: Date; ttlHours?: number }
): string {
  const stamp = formatIcsDateTime(opts.dtstamp);
  const ttl = `PT${Math.max(1, Math.round(opts.ttlHours ?? 12))}H`;
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Pharos//Money Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText(opts.name)}`,
    `NAME:${escapeIcsText(opts.name)}`,
    `REFRESH-INTERVAL;VALUE=DURATION:${ttl}`,
    `X-PUBLISHED-TTL:${ttl}`,
  ];
  if (opts.description) {
    lines.push(`X-WR-CALDESC:${escapeIcsText(opts.description)}`);
  }
  for (const ev of events) {
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${ev.uid}`);
    lines.push(`DTSTAMP:${stamp}`);
    lines.push(`DTSTART;VALUE=DATE:${formatIcsDate(ev.date)}`);
    lines.push(`DTEND;VALUE=DATE:${formatIcsDate(nextDay(ev.date))}`);
    lines.push(`SUMMARY:${escapeIcsText(ev.summary)}`);
    if (ev.description) lines.push(`DESCRIPTION:${escapeIcsText(ev.description)}`);
    if (ev.categories?.length) lines.push(`CATEGORIES:${ev.categories.map(escapeIcsText).join(',')}`);
    lines.push('TRANSP:TRANSPARENT');
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldIcsLine).join('\r\n') + '\r\n';
}
