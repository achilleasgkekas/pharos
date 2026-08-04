import { describe, it, expect } from 'vitest';
import { verifyBackupJson, formatBackupCounts } from './backupVerify';

// verifyBackupJson is the read-only integrity check behind Settings → Storage & backup →
// Verify, and the pre-flight importData runs before it touches the database. Two
// distinctions carry all the weight and are pinned hardest below:
//
//   ERROR   = the file is not a usable backup at all → importData REFUSES it outright.
//   WARNING = parts of it will be skipped → importData still runs (14 good collections
//             out of 15 are worth restoring), but the user is told what was dropped.
//
// Getting that boundary wrong is what makes the feature either useless (refusing nothing)
// or destructive (refusing a mostly-fine backup at the exact moment it is needed), so
// every case below states which side it belongs to and why.

const KEYS = ['items', 'receipts', 'expenses'] as const;

/** A minimal well-formed backup, shaped exactly like exportData()'s output. */
function goodBackup(collections?: Record<string, unknown>) {
  return JSON.stringify({
    app: 'homepage',
    version: 1,
    exportedAt: '2026-08-04T03:30:00.000Z',
    collections: collections ?? {
      items: [{ _id: 'i1', title: 'Switch' }],
      receipts: [{ _id: 'r1', store: 'Plaisio' }, { _id: 'r2', store: 'Kotsovolos' }],
      expenses: [{ _id: 'e1', vendor: 'OTE' }],
    },
  });
}

const errors = (r: { issues: { level: string; message: string }[] }) => r.issues.filter((i) => i.level === 'error').map((i) => i.message);
const warnings = (r: { issues: { level: string; message: string }[] }) => r.issues.filter((i) => i.level === 'warning').map((i) => i.message);

describe('verifyBackupJson — a healthy backup', () => {
  it('reports ok with per-collection counts and the export timestamp', () => {
    const r = verifyBackupJson(goodBackup(), KEYS);
    expect(r.ok).toBe(true);
    expect(r.issues).toEqual([]);
    expect(r.counts).toEqual({ items: 1, receipts: 2, expenses: 1 });
    expect(r.totalDocs).toBe(4);
    expect(r.exportedAt).toBe('2026-08-04T03:30:00.000Z');
    expect(r.version).toBe(1);
    expect(r.missing).toEqual([]);
    expect(r.unknown).toEqual([]);
  });

  it('measures the file in BYTES, not characters', () => {
    // The failure this whole module exists for is a 0-byte / truncated file, and Greek
    // store names are multi-byte — a character count would understate a real backup.
    const json = goodBackup({ items: [{ _id: 'i1', title: 'Πλαίσιο' }] });
    expect(verifyBackupJson(json, KEYS).bytes).toBe(Buffer.byteLength(json, 'utf8'));
    expect(verifyBackupJson(json, KEYS).bytes).toBeGreaterThan(json.length);
  });
});

describe('verifyBackupJson — files that are NOT usable backups (errors)', () => {
  it('flags an empty file, which is exactly how the nightly backups failed for 53 days', () => {
    for (const empty of ['', '   ', '\n']) {
      const r = verifyBackupJson(empty, KEYS);
      expect(r.ok).toBe(false);
      expect(errors(r)[0]).toMatch(/empty/i);
    }
    expect(verifyBackupJson('', KEYS).bytes).toBe(0);
  });

  it('flags a truncated file and keeps the parser message (it names the offset)', () => {
    const cut = goodBackup().slice(0, 60);
    const r = verifyBackupJson(cut, KEYS);
    expect(r.ok).toBe(false);
    expect(errors(r)[0]).toMatch(/not valid json/i);
    // Without the underlying message a user cannot tell "truncated" from "mangled".
    expect(errors(r)[0].length).toBeGreaterThan('Not valid JSON — the file is truncated or corrupted.'.length);
  });

  it('flags valid JSON that is not a backup object', () => {
    for (const notABackup of ['[]', '"hello"', '42', 'null']) {
      const r = verifyBackupJson(notABackup, KEYS);
      expect(r.ok).toBe(false);
      expect(errors(r)[0]).toMatch(/not a pharos backup/i);
    }
  });

  it('flags a backup envelope with no collections section', () => {
    const r = verifyBackupJson(JSON.stringify({ app: 'homepage', version: 1 }), KEYS);
    expect(r.ok).toBe(false);
    expect(errors(r)[0]).toMatch(/no "collections" section/i);
  });

  it('flags an envelope whose collections are all empty', () => {
    // This is the shape a wrong-database or interrupted export leaves behind. Before
    // this check it restored as a cheerful "0 records" and looked like a success.
    const r = verifyBackupJson(goodBackup({ items: [], receipts: [], expenses: [] }), KEYS);
    expect(r.ok).toBe(false);
    expect(errors(r)).toContain('The backup contains no documents at all.');
    expect(r.totalDocs).toBe(0);
  });
});

describe('verifyBackupJson — files that restore partially (warnings, never errors)', () => {
  it('warns about a missing collection but stays ok', () => {
    // An older backup predates collections added later; refusing it would be the wrong
    // call at the one moment the user actually needs it.
    const r = verifyBackupJson(goodBackup({ items: [{ _id: 'i1' }] }), KEYS);
    expect(r.ok).toBe(true);
    expect(r.missing).toEqual(['receipts', 'expenses']);
    expect(warnings(r).join(' ')).toMatch(/missing collections: receipts, expenses/i);
  });

  it('warns about a collection that is not a list, naming that restore skips it', () => {
    const r = verifyBackupJson(goodBackup({ items: [{ _id: 'i1' }], receipts: 'oops', expenses: [{ _id: 'e1' }] }), KEYS);
    expect(r.ok).toBe(true);
    expect(warnings(r).join(' ')).toMatch(/receipts: not a list/i);
    // Not counted, because nothing from it will be restored.
    expect(r.counts.receipts).toBeUndefined();
    expect(r.totalDocs).toBe(2);
  });

  it('warns about documents without an _id, because restore inserts instead of merging', () => {
    // importData upserts by _id; a doc without one goes through Model.create, so a second
    // restore of the same file duplicates it. That is worth saying out loud.
    const r = verifyBackupJson(goodBackup({ items: [{ _id: 'i1' }, { title: 'no id' }, { _id: null }] }), KEYS);
    expect(r.ok).toBe(true);
    expect(warnings(r).join(' ')).toMatch(/items: 2 documents without an _id/i);
    expect(r.counts.items).toBe(3);
  });

  it('warns about entries that are not documents at all, and does not count them', () => {
    const r = verifyBackupJson(goodBackup({ items: [{ _id: 'i1' }, 'junk', null, ['nested']] }), KEYS);
    expect(r.ok).toBe(true);
    expect(warnings(r).join(' ')).toMatch(/items: 3 entries are not a document/i);
    // Counts are what restore would attempt, so "4 items" would be false reassurance.
    expect(r.counts.items).toBe(1);
    expect(r.totalDocs).toBe(1);
  });

  it('treats a collection holding nothing BUT junk as an unusable file, not a partial one', () => {
    const r = verifyBackupJson(goodBackup({ items: ['junk', null, 42] }), KEYS);
    expect(r.ok).toBe(false);
    expect(errors(r)).toContain('The backup contains no documents at all.');
  });

  it('uses singular wording for a single offender', () => {
    const r = verifyBackupJson(goodBackup({ items: [{ _id: 'i1' }, 'junk'] }), KEYS);
    expect(warnings(r).join(' ')).toMatch(/items: 1 entry is not a document — restore will skip it\./);
  });

  it('warns about collections this version does not restore', () => {
    // A backup from a NEWER Pharos carries keys this build has no model for; they are
    // silently ignored by importData, so the user should hear about them.
    const r = verifyBackupJson(goodBackup({ items: [{ _id: 'i1' }], receipts: [], expenses: [], futureThing: [{ _id: 'x' }] }), KEYS);
    expect(r.ok).toBe(true);
    expect(r.unknown).toEqual(['futureThing']);
    expect(warnings(r).join(' ')).toMatch(/futureThing: not restored by this version/i);
  });

  it('warns about a foreign "app" marker without refusing the file', () => {
    const r = verifyBackupJson(JSON.stringify({ app: 'something-else', collections: { items: [{ _id: 'i1' }] } }), KEYS);
    expect(r.ok).toBe(true);
    expect(warnings(r).join(' ')).toMatch(/unexpected "app" marker/i);
  });

  it('accepts a backup with no app/version fields at all', () => {
    const r = verifyBackupJson(JSON.stringify({ collections: { items: [{ _id: 'i1' }] } }), KEYS);
    expect(r.ok).toBe(true);
    expect(r.version).toBeNull();
    expect(r.exportedAt).toBeNull();
    expect(warnings(r).some((w) => /app.*marker/i.test(w))).toBe(false);
  });
});

describe('formatBackupCounts', () => {
  it('lists collections biggest-first and omits empty ones', () => {
    const s = formatBackupCounts({ counts: { items: 66, receipts: 240, expenses: 0, tasks: 12 } });
    expect(s).toBe('240 receipts, 66 items, 12 tasks');
  });

  it('caps the list and says how many were left out', () => {
    const counts = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`c${i}`, 9 - i]));
    expect(formatBackupCounts({ counts }, 3)).toBe('9 c0, 8 c1, 7 c2 +6 more');
  });

  it('says so plainly when everything is empty', () => {
    expect(formatBackupCounts({ counts: {} })).toBe('no documents');
    expect(formatBackupCounts({ counts: { items: 0 } })).toBe('no documents');
  });
});
