import { describe, it, expect } from 'vitest';
import {
  buildWorkspaceExport,
  workspaceExportFilename,
  isExportableCollection,
  resolveMaxDocs,
  WORKSPACE_EXPORT_MAX_DOCS_DEFAULT,
  type ExportedCollection,
} from './workspaceExport';

// Only the PURE helpers are unit-tested. `collectWorkspaceData` is the node-only DB reader and
// the GET route is SaaS-gated (404 when SAAS_MODE off); the envelope shape + safety guarantees
// are asserted here.

const cols: ExportedCollection[] = [
  { name: 'items', count: 2, truncated: false, docs: [{ a: 1 }, { a: 2 }] },
  { name: 'receipts', count: 1, truncated: true, docs: [{ b: 1 }] },
];
const gen = new Date('2026-07-06T12:00:00.000Z');

describe('buildWorkspaceExport', () => {
  it('emits a stable envelope with ISO generatedAt and a GDPR notice', () => {
    const out = buildWorkspaceExport({ slug: 'acme' }, cols, gen, 10000);
    expect(out.format).toBe('pharos.workspace-export');
    expect(out.version).toBe(1);
    expect(out.generatedAt).toBe('2026-07-06T12:00:00.000Z');
    expect(out.notice).toMatch(/GDPR/);
    expect(out.maxDocsPerCollection).toBe(10000);
  });

  it('projects whitelisted workspace fields with name/slug fallback', () => {
    const named = buildWorkspaceExport(
      { slug: 'acme', name: 'Acme Inc', plan: 'shared', status: 'active' },
      [],
      gen,
      100
    );
    expect(named.workspace).toEqual({
      slug: 'acme',
      name: 'Acme Inc',
      plan: 'shared',
      status: 'active',
    });
    // name falls back to slug; plan/status default to empty.
    const bare = buildWorkspaceExport({ slug: 'acme' }, [], gen, 100);
    expect(bare.workspace.name).toBe('acme');
    expect(bare.workspace.plan).toBe('');
    expect(bare.workspace.status).toBe('');
  });

  it('passes collections through with count/truncated preserved', () => {
    const out = buildWorkspaceExport({ slug: 'acme' }, cols, gen, 1);
    expect(out.collections).toHaveLength(2);
    expect(out.collections[0]).toEqual({
      name: 'items',
      count: 2,
      truncated: false,
      docs: [{ a: 1 }, { a: 2 }],
    });
    expect(out.collections[1].truncated).toBe(true);
  });

  it('coerces an invalid generatedAt to the epoch rather than emitting blank', () => {
    const out = buildWorkspaceExport({ slug: 'acme' }, [], 'not-a-date', 100);
    expect(out.generatedAt).toBe(new Date(0).toISOString());
  });
});

describe('isExportableCollection', () => {
  it('accepts real collection names', () => {
    expect(isExportableCollection('items')).toBe(true);
    expect(isExportableCollection('receipts')).toBe(true);
  });
  it('rejects system namespaces and non-names', () => {
    expect(isExportableCollection('system.indexes')).toBe(false);
    expect(isExportableCollection('system.profile')).toBe(false);
    expect(isExportableCollection('')).toBe(false);
    expect(isExportableCollection(undefined)).toBe(false);
    expect(isExportableCollection(123)).toBe(false);
  });
});

describe('resolveMaxDocs', () => {
  it('uses the default for missing/invalid/non-positive input', () => {
    expect(resolveMaxDocs(undefined)).toBe(WORKSPACE_EXPORT_MAX_DOCS_DEFAULT);
    expect(resolveMaxDocs('nope')).toBe(WORKSPACE_EXPORT_MAX_DOCS_DEFAULT);
    expect(resolveMaxDocs('0')).toBe(WORKSPACE_EXPORT_MAX_DOCS_DEFAULT);
    expect(resolveMaxDocs('-5')).toBe(WORKSPACE_EXPORT_MAX_DOCS_DEFAULT);
  });
  it('floors a valid positive number', () => {
    expect(resolveMaxDocs('500')).toBe(500);
    expect(resolveMaxDocs('250.9')).toBe(250);
    expect(resolveMaxDocs(undefined, 42)).toBe(42);
  });
});

describe('workspaceExportFilename', () => {
  it('derives a safe filename from the slug', () => {
    expect(workspaceExportFilename('acme')).toBe('pharos-workspace-acme.json');
  });
  it('strips unsafe characters and path traversal, with a non-empty fallback', () => {
    expect(workspaceExportFilename('../../etc/passwd')).toBe('pharos-workspace-etcpasswd.json');
    expect(workspaceExportFilename('!!!')).toBe('pharos-workspace-workspace.json');
  });
});
