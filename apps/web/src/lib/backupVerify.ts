/**
 * Read-only integrity check for a JSON backup file (Settings → Storage & backup).
 *
 * WHY THIS EXISTS: `exportData()` writes a backup and nothing ever reads it back, so a
 * silently truncated file (disk filled up mid-write, an interrupted download, a copy that
 * landed as 0 bytes) looks exactly like a good one until the day it is actually needed.
 * The nightly mongodump had precisely this failure: 47 of 50 archives were zero bytes
 * while every run reported success (see scripts/backup.sh, commit 56e983e). This is the
 * same guard for the app-level JSON backup.
 *
 * It is equally the "what would a restore silently drop?" report. `importData` skips a
 * non-array collection with a bare `continue` and swallows a document that fails
 * validation in an empty `catch`, then returns a cheerful count — so today a half-broken
 * backup restores "successfully" with no indication of what was lost. Every warning below
 * names something restore would drop without saying so.
 *
 * Scope is deliberately structural (valid JSON + envelope + per-collection counts), NOT a
 * test-restore into a sandbox database: that would need a second Mongo instance and would
 * make a read-only "is my backup any good?" click expensive and risky.
 *
 * Pure and dependency-free on purpose — it takes the collection-key registry as an
 * argument rather than importing lib/backupModels, which pulls in every Mongoose model.
 */

export type BackupIssueLevel = 'error' | 'warning';
export type BackupIssue = { level: BackupIssueLevel; message: string };

export type BackupVerifyResult = {
  /** True when the file is usable as a backup. Warnings can still be present. */
  ok: boolean;
  bytes: number;
  exportedAt: string | null;
  version: number | null;
  /** Documents per known collection, only for keys actually present as arrays. */
  counts: Record<string, number>;
  totalDocs: number;
  /** Known collections absent from the file (older backup, or a truncated write). */
  missing: string[];
  /** Keys in the file this version does not restore (newer backup, or foreign file). */
  unknown: string[];
  issues: BackupIssue[];
};

/**
 * ERRORS mean the file as a whole is not a usable backup, so `importData` refuses it
 * instead of half-restoring. WARNINGS mean parts of it will be skipped — restore still
 * runs, because 14 good collections out of 15 are worth having.
 */
export function verifyBackupJson(raw: string, knownKeys: readonly string[]): BackupVerifyResult {
  const issues: BackupIssue[] = [];
  const counts: Record<string, number> = {};
  const missing: string[] = [];
  const unknown: string[] = [];
  const err = (message: string) => issues.push({ level: 'error', message });
  const warn = (message: string) => issues.push({ level: 'warning', message });

  const text = typeof raw === 'string' ? raw : '';
  const bytes = byteLength(text);
  const base: Omit<BackupVerifyResult, 'ok'> = {
    bytes,
    exportedAt: null,
    version: null,
    counts,
    totalDocs: 0,
    missing,
    unknown,
    issues,
  };

  if (!text.trim()) {
    err('The file is empty — the backup never finished writing.');
    return { ...base, ok: false };
  }

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    // The parser's message carries the offset, which is how you tell a truncated file
    // ("Unexpected end of JSON input") from a mangled one.
    err(`Not valid JSON — the file is truncated or corrupted. ${(e as Error).message}`);
    return { ...base, ok: false };
  }

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    err('Not a Pharos backup — the file does not contain a backup object.');
    return { ...base, ok: false };
  }

  const root = data as Record<string, unknown>;
  const exportedAt = typeof root.exportedAt === 'string' ? root.exportedAt : null;
  const version = typeof root.version === 'number' ? root.version : null;
  if (root.app !== undefined && root.app !== 'homepage') {
    warn(`Unexpected "app" marker "${String(root.app)}" — this may not be a Pharos backup.`);
  }

  const cols = root.collections;
  if (!cols || typeof cols !== 'object' || Array.isArray(cols)) {
    err('Not a Pharos backup — no "collections" section.');
    return { ...base, exportedAt, version, ok: false };
  }
  const collections = cols as Record<string, unknown>;

  let totalDocs = 0;
  for (const key of knownKeys) {
    if (!(key in collections)) {
      missing.push(key);
      continue;
    }
    const value = collections[key];
    if (!Array.isArray(value)) {
      warn(`${key}: not a list — restore will skip this collection entirely.`);
      continue;
    }
    let notObjects = 0;
    let noId = 0;
    for (const doc of value) {
      if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
        notObjects++;
        continue;
      }
      if ((doc as Record<string, unknown>)._id == null) noId++;
    }
    // Counts are what a restore would actually attempt, not raw array length: a
    // collection holding nothing but junk entries restores nothing, and reporting
    // "3 items" for it would be the same false reassurance this module exists to end.
    counts[key] = value.length - notObjects;
    totalDocs += counts[key];
    if (notObjects > 0) warn(`${key}: ${notObjects} entr${notObjects === 1 ? 'y is' : 'ies are'} not a document — restore will skip ${notObjects === 1 ? 'it' : 'them'}.`);
    if (noId > 0) warn(`${key}: ${noId} document${noId === 1 ? '' : 's'} without an _id — restore will insert ${noId === 1 ? 'it' : 'them'} as new instead of merging.`);
  }

  for (const key of Object.keys(collections)) {
    if (!knownKeys.includes(key)) unknown.push(key);
  }
  if (unknown.length > 0) {
    warn(`${unknown.join(', ')}: not restored by this version — ${unknown.length === 1 ? 'it' : 'they'} will be ignored.`);
  }
  if (missing.length > 0) {
    warn(`Missing collection${missing.length === 1 ? '' : 's'}: ${missing.join(', ')} — nothing will be restored for ${missing.length === 1 ? 'it' : 'them'}.`);
  }

  // A backup with an envelope but no data is the exact shape a wrong-database or
  // interrupted export leaves behind, and today it restores as a silent "0 documents".
  if (totalDocs === 0) err('The backup contains no documents at all.');

  return {
    ...base,
    exportedAt,
    version,
    totalDocs,
    ok: !issues.some((i) => i.level === 'error'),
  };
}

/** "240 receipts, 66 items, 31 expenses +4 more" — the human-readable half of a report. */
export function formatBackupCounts(result: Pick<BackupVerifyResult, 'counts'>, limit = 6): string {
  const entries = Object.entries(result.counts)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return 'no documents';
  const shown = entries.slice(0, limit).map(([k, n]) => `${n.toLocaleString('en-GB')} ${k}`);
  const rest = entries.length - shown.length;
  return shown.join(', ') + (rest > 0 ? ` +${rest} more` : '');
}

/** Byte length, not character count — a 0-byte file is the failure this is looking for. */
function byteLength(s: string): number {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s).length;
  return s.length;
}
