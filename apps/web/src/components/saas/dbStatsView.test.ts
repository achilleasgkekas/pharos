import { describe, it, expect } from 'vitest';
import { dbStatsView } from './dbStatsView';

describe('dbStatsView', () => {
  it('collapses a non-object body to the all-zero not-measured view', () => {
    for (const junk of [null, undefined, 42, 'x', true]) {
      const v = dbStatsView(junk);
      expect(v.measured).toBe(false);
      expect(v).toMatchObject({
        dbName: '',
        generatedAt: '',
        total: 0,
        db: 0,
        files: 0,
        objects: 0,
        data: 0,
        storage: 0,
        index: 0,
      });
    }
  });

  it('projects a well-formed envelope', () => {
    const v = dbStatsView({
      format: 'pharos.admin-tenant-dbstats',
      version: 1,
      generatedAt: '2026-07-10T12:00:00.000Z',
      slug: 'acme',
      dbName: 'pharos_t_acme',
      measured: true,
      live: {
        dataSize: 5000,
        storageSize: 3000,
        indexSize: 1000,
        objects: 120,
        dbBytes: 4000,
        fileBytes: 2000,
        totalBytes: 6000,
      },
    });
    expect(v).toEqual({
      measured: true,
      dbName: 'pharos_t_acme',
      generatedAt: '2026-07-10T12:00:00.000Z',
      total: 6000,
      db: 4000,
      files: 2000,
      objects: 120,
      data: 5000,
      storage: 3000,
      index: 1000,
    });
  });

  it('measured is only true for a real boolean true', () => {
    expect(dbStatsView({ measured: 'true', live: {} }).measured).toBe(false);
    expect(dbStatsView({ measured: 1, live: {} }).measured).toBe(false);
    expect(dbStatsView({ measured: false, live: {} }).measured).toBe(false);
    expect(dbStatsView({ measured: true, live: {} }).measured).toBe(true);
  });

  it('floors garbage / negative / non-finite numeric fields at 0', () => {
    const v = dbStatsView({
      measured: true,
      live: {
        dataSize: -100,
        storageSize: Number.NaN,
        indexSize: 'lots',
        objects: Infinity,
        dbBytes: -1,
        fileBytes: 12.9,
        totalBytes: null,
      },
    });
    expect(v.data).toBe(0);
    expect(v.storage).toBe(0);
    expect(v.index).toBe(0);
    expect(v.objects).toBe(0);
    expect(v.db).toBe(0);
    expect(v.files).toBe(12); // floored
    expect(v.total).toBe(0);
  });

  it('tolerates a missing live block (measured flag preserved)', () => {
    const v = dbStatsView({ measured: true, dbName: 'x', generatedAt: 'bad' });
    expect(v.measured).toBe(true);
    expect(v.dbName).toBe('x');
    expect(v.generatedAt).toBe('bad'); // shaping keeps the string; the render layer validates
    expect(v.total).toBe(0);
    expect(v.objects).toBe(0);
  });

  it('non-string dbName / generatedAt fall back to empty strings', () => {
    const v = dbStatsView({ measured: true, dbName: 123, generatedAt: {}, live: {} });
    expect(v.dbName).toBe('');
    expect(v.generatedAt).toBe('');
  });
});
