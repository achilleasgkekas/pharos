// CSV serialization of the PLATFORM audit feed (TODO §8 "Superadmin console") — the download
// behind /api/saas/admin/audit/export, filtered by the same query string as /admin/audit.
//
// Why a CSV export exists at all: the on-screen feed answers "what is happening right now", but
// the two things an operator cannot do in a paginated HTML table are (a) hand an auditor a file
// covering a whole incident window and (b) pivot/grep the trail offline. Both want ONE flat file
// with every column, not 50 rows at a time behind a keyset cursor.
//
// PURE: no DB, no next/*, no React — the impure part (the query) stays in `listPlatformAudit`,
// this module only formats text, so every escaping and clamping rule below is unit-testable.
// Only meaningful when SAAS_MODE is on.
//
// NOTE on the duplicated `csvCell`: the repo's other CSV writers (app/settings/actions.ts toCSV,
// lib/taxExport.ts, lib/insuranceExport.ts) share this exact escaping + injection-guard
// convention, but settings/actions.ts is a `'use server'` module (every export must be an async
// action, so a plain helper cannot be imported out of it) and the other two are feature-owned
// files this control-plane module should not depend on. Same trade-off, and same reason, as the
// GREEK_MAP copy in lib/tenancy/translit.ts: 4 lines duplicated beats an import that either does
// not compile or couples the SaaS layer to a feature lib. Keep the convention in sync by hand.
import { parseAdminAuditQuery, type AdminAuditQuery } from './adminAudit';
import { actionLabel, actorLabel, metaSummary } from '@/components/saas/activityView';
import { workspaceLabel, type PlatformActivityInput } from '@/components/saas/platformActivity';

/**
 * Hard ceiling on one export. The audit collection is append-only and unbounded, so the export
 * needs a cap for the same reason the page does — but a page-sized cap (200) would make the file
 * useless for an incident review, hence a much larger, still finite, limit.
 */
export const MAX_PLATFORM_AUDIT_EXPORT = 5000;
/** Default export size when `?limit=` is absent: generous enough to cover a normal incident
 *  window in one file without pulling the ceiling every time. */
export const DEFAULT_PLATFORM_AUDIT_EXPORT = 1000;

/**
 * UTF-8 byte-order mark. Prepended to the file because the single most likely content of a
 * Workspace column here is a GREEK workspace name, and Excel on Windows reads a BOM-less UTF-8
 * CSV as a legacy codepage — «Πλαίσιο» arrives as mojibake and the export looks broken. Included
 * in `buildPlatformAuditCsv` output (rather than left to the route) so there is exactly one place
 * that can get it wrong, covered by a test.
 */
export const UTF8_BOM = '﻿';

/**
 * Parse the export query string. Delegates action/tenant/from/to/cursor to the page's parser (identical
 * semantics, so a "Download CSV" link can carry the on-screen filters verbatim) and re-derives
 * `limit` against the export ceiling — `parseAdminAuditQuery` has already clamped it to the
 * PAGE maximum, which is far too small here. PURE.
 */
export function parseAuditExportQuery(params: URLSearchParams): AdminAuditQuery {
  const base = parseAdminAuditQuery(params);
  const rawLimit = Number(params.get('limit'));
  const limit =
    Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.min(MAX_PLATFORM_AUDIT_EXPORT, Math.floor(rawLimit))
      : DEFAULT_PLATFORM_AUDIT_EXPORT;
  return { ...base, limit };
}

/**
 * Column headers, in file order. Both the raw verb and its human label are present on purpose:
 * the raw `action` is what an operator greps/pivots on, the label is what a non-engineer auditor
 * reads. Dropping either would make the file worse for one of the two audiences it exists for.
 */
export const PLATFORM_AUDIT_CSV_HEADERS = [
  'Timestamp',
  'Workspace',
  'Workspace slug',
  'Action',
  'Action label',
  'Actor',
  'Actor email',
  'Target',
  'Details',
  'Event id',
] as const;

/**
 * Escape one CSV cell: quote when the value contains a comma/quote/newline, double inner quotes,
 * and neutralize a leading `= + - @ TAB CR` so a spreadsheet does not evaluate an audit value as
 * a formula (audit targets are user-supplied emails/slugs, so this is a real injection surface).
 * PURE — never throws, null/undefined → ''.
 */
export function csvCell(v: string | number | null | undefined): string {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * One export row, in `PLATFORM_AUDIT_CSV_HEADERS` order. Reuses the same display helpers as the
 * on-screen feed (`actionLabel`/`actorLabel`/`metaSummary`/`workspaceLabel`) so the file and the
 * table can never disagree about what an event says. Always returns exactly as many cells as
 * there are headers. PURE.
 */
export function platformAuditCsvRow(row: PlatformActivityInput): string[] {
  return [
    row.createdAt ?? '',
    workspaceLabel(row),
    row.workspaceSlug ?? '',
    row.action ?? '',
    actionLabel(row.action),
    actorLabel(row),
    row.actorEmail ?? '',
    row.target ?? '',
    metaSummary(row.meta) ?? '',
    row.id ?? '',
  ];
}

/**
 * The whole file: BOM + header line + one line per event, CRLF-separated (the RFC 4180 line
 * ending, and the one Excel expects). Rows keep the caller's order — the reader already sorts
 * newest-first. An empty feed still yields the header line, so the download is never a zero-byte
 * file that reads like a failure. PURE.
 */
export function buildPlatformAuditCsv(rows: readonly PlatformActivityInput[]): string {
  const lines = [
    PLATFORM_AUDIT_CSV_HEADERS.map(csvCell).join(','),
    ...rows.map((r) => platformAuditCsvRow(r).map(csvCell).join(',')),
  ];
  return UTF8_BOM + lines.join('\r\n');
}

/** Keep a filename to safe, predictable characters (it lands in Content-Disposition and on a
 *  filesystem). Anything outside a-z0-9 collapses to '-', runs collapse, edges trim. */
function slugPart(v: string | null | undefined, fallback: string): string {
  const s = (v ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s || fallback;
}

/** A window bound as a filename-safe day, or '' when unbounded. UTC slice, matching how the bound
 *  was parsed. */
function dayPart(d: Date | null | undefined): string {
  return d && !Number.isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : '';
}

/**
 * Download filename encoding the active filters and the export day, e.g.
 * `pharos-audit-acme-member-added-2026-07-30.csv`, or with a window:
 * `pharos-audit-platform-all-from-2026-07-01-to-2026-07-15-2026-07-30.csv`.
 *
 * Filters appear in the name because an operator attaching this to a ticket should not have to
 * remember which slice it was — and that argument is strongest for the TIME window, since two
 * exports of the same workspace and verb are otherwise indistinguishable by name. The trailing
 * date stays the day the file was generated, which is a different fact from the window it covers.
 * PURE.
 */
export function platformAuditCsvFilename(
  query: Pick<AdminAuditQuery, 'action' | 'tenant'> & Partial<Pick<AdminAuditQuery, 'from' | 'to'>>,
  now: Date = new Date()
): string {
  const day = Number.isNaN(now.getTime()) ? 'unknown-date' : now.toISOString().slice(0, 10);
  const from = dayPart(query.from);
  const to = dayPart(query.to);
  return (
    [
      'pharos-audit',
      slugPart(query.tenant, 'platform'),
      slugPart(query.action, 'all'),
      ...(from ? ['from', from] : []),
      ...(to ? ['to', to] : []),
      day,
    ].join('-') + '.csv'
  );
}
