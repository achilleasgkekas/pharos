import path from 'node:path';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

// Fixed storage root so the traversal guards and stat paths are deterministic and never touch
// the real filesystem. STORAGE_ROOT is read once at module-eval time, so it must be set before
// the dynamic import below.
const ROOT = path.resolve('/srv/pharos-storage');

// Mock node:fs so statWorkspaceFiles never hits disk. `<root>/receipts/present.pdf` exists
// (11 bytes); everything else throws ENOENT-like.
vi.mock('node:fs', () => ({
  promises: {
    stat: vi.fn(async (full: string) => {
      if (full === path.join(ROOT, 'receipts/present.pdf')) {
        return { isFile: () => true, size: 11 };
      }
      if (full === path.join(ROOT, 'equipment/adir')) {
        return { isFile: () => false, size: 4096 }; // a directory, not a file
      }
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    }),
  },
}));

let mod: typeof import('./workspaceFiles');

beforeAll(async () => {
  process.env.STORAGE_ROOT = ROOT;
  mod = await import('./workspaceFiles');
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('isStorageRelative', () => {
  it('accepts a clean relative path', () => {
    expect(mod.isStorageRelative('receipts/2026/07/a.pdf')).toBe(true);
  });
  it('rejects blanks, non-strings, absolute paths and traversal', () => {
    expect(mod.isStorageRelative('')).toBe(false);
    expect(mod.isStorageRelative('   ')).toBe(false);
    expect(mod.isStorageRelative(null)).toBe(false);
    expect(mod.isStorageRelative(42)).toBe(false);
    expect(mod.isStorageRelative('/etc/passwd')).toBe(false);
    expect(mod.isStorageRelative('../../etc/passwd')).toBe(false);
    expect(mod.isStorageRelative('receipts/../../secret')).toBe(false);
  });
  it('trims surrounding whitespace before validating', () => {
    expect(mod.isStorageRelative('  receipts/a.pdf  ')).toBe(true);
  });
});

describe('fileBucket', () => {
  it('returns the first path segment', () => {
    expect(mod.fileBucket('receipts/2026/07/a.pdf')).toBe('receipts');
    expect(mod.fileBucket('equipment/x.jpg')).toBe('equipment');
  });
  it('handles backslashes and empty input', () => {
    expect(mod.fileBucket('statements\\2026\\s.pdf')).toBe('statements');
    expect(mod.fileBucket('')).toBe('');
  });
});

describe('extractFileRefs', () => {
  it('pulls single-value and array file fields, skipping blanks and bad values', () => {
    const doc = {
      filePath: 'receipts/a.pdf',
      thumbPath: '',
      photos: ['equipment/1.jpg', '', '/abs/2.jpg', 'equipment/3.jpg'],
      other: 'ignored',
    };
    expect(mod.extractFileRefs(doc)).toEqual([
      'receipts/a.pdf',
      'equipment/1.jpg',
      'equipment/3.jpg',
    ]);
  });
  it('returns [] for non-objects and docs without file fields', () => {
    expect(mod.extractFileRefs(null)).toEqual([]);
    expect(mod.extractFileRefs('x')).toEqual([]);
    expect(mod.extractFileRefs({ name: 'n' })).toEqual([]);
  });
  it('trims references', () => {
    expect(mod.extractFileRefs({ filePath: '  receipts/a.pdf ' })).toEqual(['receipts/a.pdf']);
  });
});

describe('dedupeFileRefs', () => {
  it('dedupes, drops invalid, and sorts stably', () => {
    expect(
      mod.dedupeFileRefs(['receipts/b.pdf', 'receipts/a.pdf', 'receipts/b.pdf', '/abs', ''])
    ).toEqual(['receipts/a.pdf', 'receipts/b.pdf']);
  });
});

describe('buildFileManifest', () => {
  const entries = [
    { path: 'receipts/present.pdf', bucket: 'receipts', exists: true, bytes: 11 },
    { path: 'receipts/gone.pdf', bucket: 'receipts', exists: false, bytes: 0 },
  ];

  it('builds the envelope with computed totals and whitelisted workspace fields', () => {
    const out = mod.buildFileManifest(
      { slug: 'acme', name: 'Acme', plan: 'shared', status: 'active' },
      entries,
      new Date('2026-07-06T12:00:00.000Z')
    );
    expect(out.format).toBe('pharos.workspace-files-manifest');
    expect(out.version).toBe(1);
    expect(out.generatedAt).toBe('2026-07-06T12:00:00.000Z');
    expect(out.notice).toContain('report only');
    expect(out.workspace).toEqual({ slug: 'acme', name: 'Acme', plan: 'shared', status: 'active' });
    expect(out.totals).toEqual({ files: 2, present: 1, missing: 1, bytes: 11 });
    expect(out.files).toEqual(entries);
  });

  it('falls back name→slug and never emits blank meta; invalid date → epoch', () => {
    const out = mod.buildFileManifest({ slug: 'acme' }, [], 'not-a-date');
    expect(out.workspace).toEqual({ slug: 'acme', name: 'acme', plan: '', status: '' });
    expect(out.generatedAt).toBe(new Date(0).toISOString());
    expect(out.totals).toEqual({ files: 0, present: 0, missing: 0, bytes: 0 });
  });

  it('clamps negative byte sizes out of the total', () => {
    const out = mod.buildFileManifest({ slug: 'x' }, [
      { path: 'receipts/a', bucket: 'receipts', exists: true, bytes: -5 },
    ], new Date('2026-07-06T12:00:00.000Z'));
    expect(out.totals.bytes).toBe(0);
  });
});

describe('workspaceFilesManifestFilename', () => {
  it('derives a safe filename from the slug with a fallback', () => {
    expect(mod.workspaceFilesManifestFilename('acme')).toBe('pharos-workspace-acme-files.json');
    expect(mod.workspaceFilesManifestFilename('a/b*c')).toBe('pharos-workspace-abc-files.json');
    expect(mod.workspaceFilesManifestFilename('')).toBe('pharos-workspace-workspace-files.json');
  });
});

describe('statWorkspaceFiles (read-only fs pass)', () => {
  it('reports present files with size, missing files as exists:false, and stats no directories', async () => {
    const out = await mod.statWorkspaceFiles([
      'receipts/present.pdf',
      'receipts/gone.pdf',
      'equipment/adir',
    ]);
    expect(out).toEqual([
      { path: 'receipts/present.pdf', bucket: 'receipts', exists: true, bytes: 11 },
      { path: 'receipts/gone.pdf', bucket: 'receipts', exists: false, bytes: 0 },
      { path: 'equipment/adir', bucket: 'equipment', exists: false, bytes: 0 },
    ]);
  });

  it('treats a root-escaping ref as missing WITHOUT stat-ing it', async () => {
    const fs = (await import('node:fs')).promises as unknown as { stat: ReturnType<typeof vi.fn> };
    const out = await mod.statWorkspaceFiles(['../../etc/passwd']);
    expect(out).toEqual([
      { path: '../../etc/passwd', bucket: '..', exists: false, bytes: 0 },
    ]);
    expect(fs.stat).not.toHaveBeenCalled();
  });
});
