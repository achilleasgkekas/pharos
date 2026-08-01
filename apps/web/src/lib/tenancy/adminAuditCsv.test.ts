import { describe, it, expect } from 'vitest';
import {
  csvCell,
  parseAuditExportQuery,
  platformAuditCsvRow,
  buildPlatformAuditCsv,
  platformAuditCsvFilename,
  PLATFORM_AUDIT_CSV_HEADERS,
  UTF8_BOM,
  MAX_PLATFORM_AUDIT_EXPORT,
  DEFAULT_PLATFORM_AUDIT_EXPORT,
} from './adminAuditCsv';
import { MAX_PLATFORM_AUDIT_PAGE } from './adminAudit';
import type { PlatformActivityInput } from '@/components/saas/platformActivity';

// The CSV export is the artefact an operator hands to an auditor or attaches to a ticket, so the
// failure modes worth pinning are not "does it join with commas" but: a cell that breaks out of
// its column (unescaped quote/comma/newline), a cell a spreadsheet EVALUATES (formula injection
// through a user-supplied audit target), Greek workspace names arriving as mojibake in Excel (the
// BOM), a header/row width drift that silently shifts every value one column left, and the export
// ceiling — which must be much larger than the page cap while still being finite over an
// append-only collection.

function ev(over: Partial<PlatformActivityInput> = {}): PlatformActivityInput {
  return {
    id: 'e1',
    action: 'member.added',
    actor: 'a1',
    actorEmail: 'ops@pharos.dev',
    actorName: 'Ops',
    target: 'new@example.com',
    meta: { role: 'admin' },
    createdAt: '2026-07-30T08:00:00.000Z',
    workspaceSlug: 'acme',
    workspaceName: 'Acme',
    ...over,
  };
}

const sp = (q: string) => new URLSearchParams(q);

describe('csvCell', () => {
  it('leaves plain values untouched', () => {
    expect(csvCell('acme')).toBe('acme');
    expect(csvCell('member.added')).toBe('member.added');
    expect(csvCell(42)).toBe('42');
  });

  it('renders null/undefined as an empty cell rather than "null"', () => {
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
  });

  it('quotes and doubles inner quotes so a value cannot break out of its column', () => {
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
  });

  it('quotes values containing a comma, LF, or CR', () => {
    expect(csvCell('Acme, Inc')).toBe('"Acme, Inc"');
    expect(csvCell('line1\nline2')).toBe('"line1\nline2"');
    // A bare CR inside a cell would otherwise look like a record separator to a strict parser.
    // The injection guard is anchored to the START of the value, so a mid-value CR only triggers
    // quoting, not the leading apostrophe.
    expect(csvCell('line1\rline2')).toBe('"line1\rline2"');
  });

  it('neutralizes formula-injection leaders (audit targets are user-supplied)', () => {
    // The realistic vector: an account signs up with a display name / email-shaped target that
    // starts with '=' and the auditor opens the file in Excel.
    for (const lead of ['=', '+', '-', '@', '\t']) {
      expect(csvCell(`${lead}cmd|calc`)).toBe(`'${lead}cmd|calc`);
    }
  });

  it('still quotes an injection-guarded value that also contains a comma', () => {
    expect(csvCell('=SUM(A1,A2)')).toBe('"\'=SUM(A1,A2)"');
  });
});

describe('platformAuditCsvRow', () => {
  it('emits exactly one cell per header, in header order', () => {
    const row = platformAuditCsvRow(ev());
    expect(row).toHaveLength(PLATFORM_AUDIT_CSV_HEADERS.length);
    expect(row).toEqual([
      '2026-07-30T08:00:00.000Z',
      'Acme',
      'acme',
      'member.added',
      'Member added',
      'Ops',
      'ops@pharos.dev',
      'new@example.com',
      'role: admin',
      'e1',
    ]);
  });

  it('keeps BOTH the raw verb and the human label (grep-ability + auditor readability)', () => {
    const row = platformAuditCsvRow(ev({ action: 'workspace.erasure_requested' }));
    expect(row[3]).toBe('workspace.erasure_requested');
    expect(row[4]).toBe('Erasure requested');
  });

  it('labels an event whose workspace is gone instead of leaving the column blank', () => {
    const row = platformAuditCsvRow(ev({ workspaceSlug: null, workspaceName: null }));
    expect(row[1]).toBe('deleted workspace');
    expect(row[2]).toBe('');
  });

  it('falls back to the slug when the workspace has no display name', () => {
    expect(platformAuditCsvRow(ev({ workspaceName: null }))[1]).toBe('acme');
  });

  it('renders a system (actor-less) event as System with an empty email', () => {
    const row = platformAuditCsvRow(
      ev({ actor: null, actorEmail: null, actorName: null, action: 'plan.changed' })
    );
    expect(row[5]).toBe('System');
    expect(row[6]).toBe('');
  });

  it('never emits null/undefined cells for a maximally empty event', () => {
    const row = platformAuditCsvRow({
      id: '',
      action: '',
      actor: null,
      actorEmail: null,
      actorName: null,
      target: null,
      meta: null,
      createdAt: null,
      workspaceSlug: null,
      workspaceName: null,
    });
    expect(row).toHaveLength(PLATFORM_AUDIT_CSV_HEADERS.length);
    for (const cell of row) expect(typeof cell).toBe('string');
  });

  it('does not leak a secret-looking meta key that redactMeta would have stripped upstream', () => {
    // Defence in depth: the reader redacts, but if a raw row ever reached here the export must
    // not become a wider leak than the on-screen feed. metaSummary only prints what it is given,
    // so this pins that the row builder adds no extra fields of its own.
    const row = platformAuditCsvRow(ev({ meta: { role: 'admin' } }));
    expect(row.join('|')).not.toMatch(/tokenHash|password|secret/i);
  });
});

describe('buildPlatformAuditCsv', () => {
  it('starts with the UTF-8 BOM so Excel reads Greek workspace names correctly', () => {
    const csv = buildPlatformAuditCsv([ev({ workspaceName: 'Πλαίσιο' })]);
    expect(csv.startsWith(UTF8_BOM)).toBe(true);
    expect(csv).toContain('Πλαίσιο');
  });

  it('uses CRLF line endings (RFC 4180 / Excel)', () => {
    const csv = buildPlatformAuditCsv([ev(), ev({ id: 'e2' })]);
    const lines = csv.slice(UTF8_BOM.length).split('\r\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe(PLATFORM_AUDIT_CSV_HEADERS.join(','));
    expect(csv).not.toMatch(/[^\r]\n/);
  });

  it('emits the header line even for an empty feed (an empty file reads like a failure)', () => {
    const csv = buildPlatformAuditCsv([]);
    expect(csv).toBe(UTF8_BOM + PLATFORM_AUDIT_CSV_HEADERS.join(','));
  });

  it('preserves the reader order (newest first) rather than re-sorting', () => {
    const csv = buildPlatformAuditCsv([ev({ id: 'newest' }), ev({ id: 'older' })]);
    expect(csv.indexOf('newest')).toBeLessThan(csv.indexOf('older'));
  });

  it('keeps every data row at the header width even when values contain commas/newlines', () => {
    // The regression this guards: a comma inside a workspace name shifting every later column
    // one place left, which reads as corrupted data rather than as an escaping bug.
    const csv = buildPlatformAuditCsv([
      ev({ workspaceName: 'Acme, Inc', target: 'a\nb', meta: { note: 'x,y' } }),
    ]);
    const body = csv.slice(UTF8_BOM.length).split('\r\n')[1];
    // Count only the separators outside quotes.
    let depth = 0;
    let commas = 0;
    for (const ch of body) {
      if (ch === '"') depth ^= 1;
      else if (ch === ',' && !depth) commas++;
    }
    expect(commas).toBe(PLATFORM_AUDIT_CSV_HEADERS.length - 1);
  });
});

describe('parseAuditExportQuery', () => {
  it('defaults to the export size, which is far above the page cap', () => {
    expect(parseAuditExportQuery(sp('')).limit).toBe(DEFAULT_PLATFORM_AUDIT_EXPORT);
    expect(DEFAULT_PLATFORM_AUDIT_EXPORT).toBeGreaterThan(MAX_PLATFORM_AUDIT_PAGE);
  });

  it('re-clamps limit against the export ceiling, not the page ceiling', () => {
    // The bug this exists to prevent: reusing parseAdminAuditQuery verbatim would silently cap
    // every export at 200 rows while still looking like a complete file.
    expect(parseAuditExportQuery(sp('limit=1500')).limit).toBe(1500);
    expect(parseAuditExportQuery(sp('limit=999999')).limit).toBe(MAX_PLATFORM_AUDIT_EXPORT);
  });

  it('falls back to the default for non-numeric, zero, or negative limits', () => {
    for (const q of ['limit=abc', 'limit=0', 'limit=-5', 'limit=']) {
      expect(parseAuditExportQuery(sp(q)).limit).toBe(DEFAULT_PLATFORM_AUDIT_EXPORT);
    }
  });

  it('floors a fractional limit', () => {
    expect(parseAuditExportQuery(sp('limit=10.9')).limit).toBe(10);
  });

  it('carries the page filters over verbatim so a Download link matches what is on screen', () => {
    const q = parseAuditExportQuery(sp('tenant=ACME&action=member.added'));
    expect(q.tenant).toBe('acme');
    expect(q.action).toBe('member.added');
  });

  it('drops an unknown action instead of rejecting (same leniency as the page)', () => {
    expect(parseAuditExportQuery(sp('action=not.a.verb')).action).toBeNull();
  });

  it('ignores a tampered cursor (exports the newest page instead of throwing)', () => {
    expect(parseAuditExportQuery(sp('before=not-a-cursor')).cursor).toBeNull();
  });
});

describe('platformAuditCsvFilename', () => {
  const at = new Date('2026-07-30T08:00:00.000Z');

  it('encodes the active filters and the export day', () => {
    expect(platformAuditCsvFilename({ tenant: 'acme', action: 'member.added' }, at)).toBe(
      'pharos-audit-acme-member-added-2026-07-30.csv'
    );
  });

  it('names the unfiltered export platform/all', () => {
    expect(platformAuditCsvFilename({ tenant: null, action: null }, at)).toBe(
      'pharos-audit-platform-all-2026-07-30.csv'
    );
  });

  it('never emits characters that could escape the filename or a header', () => {
    // A slug reaches here from the query string, so quotes/slashes/CRLF would otherwise land
    // inside the Content-Disposition header.
    const name = platformAuditCsvFilename(
      { tenant: '../../etc/passwd"\r\n', action: null },
      at
    );
    expect(name).toMatch(/^[a-z0-9.-]+$/);
    expect(name).not.toContain('..');
  });

  it('does not produce an empty segment for a slug with no usable characters', () => {
    expect(platformAuditCsvFilename({ tenant: '///', action: null }, at)).toBe(
      'pharos-audit-platform-all-2026-07-30.csv'
    );
  });

  it('degrades to a marker instead of throwing on an invalid date', () => {
    expect(platformAuditCsvFilename({ tenant: null, action: null }, new Date('nope'))).toBe(
      'pharos-audit-platform-all-unknown-date.csv'
    );
  });
});

describe('platformAuditCsvFilename · date window', () => {
  const at = new Date('2026-07-31T08:00:00.000Z');
  const from = new Date('2026-07-01T00:00:00.000Z');
  const to = new Date('2026-07-15T23:59:59.999Z');

  it('encodes the window, keeping the generation day as a separate trailing fact', () => {
    // Without this, two exports of the same workspace+verb over different incident windows land
    // in a ticket with byte-identical names.
    expect(platformAuditCsvFilename({ tenant: null, action: null, from, to }, at)).toBe(
      'pharos-audit-platform-all-from-2026-07-01-to-2026-07-15-2026-07-31.csv'
    );
  });

  it('encodes a one-sided window', () => {
    expect(platformAuditCsvFilename({ tenant: null, action: null, from }, at)).toBe(
      'pharos-audit-platform-all-from-2026-07-01-2026-07-31.csv'
    );
    expect(platformAuditCsvFilename({ tenant: null, action: null, to }, at)).toBe(
      'pharos-audit-platform-all-to-2026-07-15-2026-07-31.csv'
    );
  });

  it('names an end-of-day bound after its OWN day (no UTC rollover)', () => {
    expect(platformAuditCsvFilename({ tenant: null, action: null, to }, at)).toContain(
      'to-2026-07-15'
    );
  });

  it('is unchanged when no window is set (back-compatible with existing links)', () => {
    expect(platformAuditCsvFilename({ tenant: 'acme', action: 'member.added' }, at)).toBe(
      'pharos-audit-acme-member-added-2026-07-31.csv'
    );
  });

  it('ignores an invalid Date bound rather than emitting "invalid-date" in the name', () => {
    expect(platformAuditCsvFilename({ tenant: null, action: null, from: new Date('x') }, at)).toBe(
      'pharos-audit-platform-all-2026-07-31.csv'
    );
  });

  it('still yields only filename-safe characters with a window set', () => {
    const name = platformAuditCsvFilename({ tenant: 'ACME Co!', action: null, from, to }, at);
    expect(name).toMatch(/^[a-z0-9.-]+$/);
  });
});

describe('platformAuditCsvFilename · actor', () => {
  const at = new Date('2026-07-31T08:00:00.000Z');

  it('encodes the actor, prefixed by- so a mangled email still reads as a person', () => {
    expect(
      platformAuditCsvFilename({ tenant: null, action: null, actor: 'ana@example.com' }, at)
    ).toBe('pharos-audit-platform-all-by-ana-example-com-2026-07-31.csv');
  });

  it('places the actor before the window, in a stable order', () => {
    // Order matters only in that it must be deterministic: two exports of the same slice have to
    // produce the same name, or a re-download looks like a different file in a ticket.
    const from = new Date('2026-07-01T00:00:00.000Z');
    const to = new Date('2026-07-15T23:59:59.999Z');
    expect(
      platformAuditCsvFilename(
        { tenant: 'acme', action: 'member.added', actor: 'ana@example.com', from, to },
        at
      )
    ).toBe(
      'pharos-audit-acme-member-added-by-ana-example-com-from-2026-07-01-to-2026-07-15-2026-07-31.csv'
    );
  });

  it('is unchanged when no actor is set (back-compatible with existing links)', () => {
    expect(platformAuditCsvFilename({ tenant: 'acme', action: null, actor: null }, at)).toBe(
      'pharos-audit-acme-all-2026-07-31.csv'
    );
  });

  it('never lets an email escape the filename or the Content-Disposition header', () => {
    // `actor` arrives from the query string, so `@`, dots, quotes and CRLF all reach here.
    const name = platformAuditCsvFilename(
      { tenant: null, action: null, actor: 'a"\r\n@../evil.com' },
      at
    );
    expect(name).toMatch(/^[a-z0-9.-]+$/);
    expect(name).not.toContain('..');
  });

  it('does not emit an empty segment for an actor with no usable characters', () => {
    const name = platformAuditCsvFilename({ tenant: null, action: null, actor: '@@@' }, at);
    expect(name).toBe('pharos-audit-platform-all-by-actor-2026-07-31.csv');
    expect(name).not.toContain('--');
  });
});

describe('parseAuditExportQuery · actor', () => {
  it('carries the actor over normalized, so a Download link matches the screen', () => {
    expect(parseAuditExportQuery(sp('actor=%20Ana%40Example.COM%20')).actor).toBe(
      'ana@example.com'
    );
  });

  it('treats a blank actor as no filter', () => {
    expect(parseAuditExportQuery(sp('actor=')).actor).toBeNull();
  });
});

describe('parseAuditExportQuery · date window', () => {
  it('carries the window over so a Download link exports the slice on screen', () => {
    const q = parseAuditExportQuery(sp('from=2026-07-01&to=2026-07-15'));
    expect(q.from?.toISOString()).toBe('2026-07-01T00:00:00.000Z');
    expect(q.to?.toISOString()).toBe('2026-07-15T23:59:59.999Z');
  });

  it('applies the same inversion correction as the page', () => {
    const q = parseAuditExportQuery(sp('from=2026-07-15&to=2026-07-01'));
    expect(q.from?.toISOString()).toBe('2026-07-01T00:00:00.000Z');
    expect(q.to?.toISOString()).toBe('2026-07-15T23:59:59.999Z');
  });

  it('ignores an unparseable bound instead of failing the download', () => {
    expect(parseAuditExportQuery(sp('from=nope')).from).toBeNull();
  });
});
