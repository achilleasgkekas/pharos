import { describe, it, expect } from 'vitest';
import { summarizeLiveDbStats, buildLiveDbStats } from './adminTenantDbStats';

// PURE helpers only. `readLiveDbStatsForAdmin` is the node-only reader (registry lookup + LIVE
// read-only db.stats() on the tenant data plane) and the route is superadmin-gated (404 when
// SAAS_MODE off / console not enabled).

describe('summarizeLiveDbStats', () => {
  it('projects a raw db.stats() doc and derives billed db + total bytes', () => {
    const out = summarizeLiveDbStats(
      { dataSize: 5000, storageSize: 2048, indexSize: 1024, objects: 42 },
      512
    );
    expect(out).toEqual({
      dataSize: 5000,
      storageSize: 2048,
      indexSize: 1024,
      objects: 42,
      dbBytes: 3072, // storageSize + indexSize
      fileBytes: 512,
      totalBytes: 3584, // dbBytes + fileBytes
    });
  });

  it('null raw → zero db footprint but still counts file bytes', () => {
    const out = summarizeLiveDbStats(null, 900);
    expect(out.dataSize).toBe(0);
    expect(out.storageSize).toBe(0);
    expect(out.indexSize).toBe(0);
    expect(out.objects).toBe(0);
    expect(out.dbBytes).toBe(0);
    expect(out.fileBytes).toBe(900);
    expect(out.totalBytes).toBe(900);
  });

  it('defensively coerces negative / NaN / missing fields to 0', () => {
    const out = summarizeLiveDbStats(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { dataSize: -1, storageSize: NaN, indexSize: undefined, objects: Infinity } as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      -50 as any
    );
    expect(out).toEqual({
      dataSize: 0,
      storageSize: 0,
      indexSize: 0,
      objects: 0,
      dbBytes: 0,
      fileBytes: 0,
      totalBytes: 0,
    });
  });

  it('floors fractional byte figures', () => {
    const out = summarizeLiveDbStats(
      { dataSize: 10.9, storageSize: 100.7, indexSize: 50.2, objects: 3.9 },
      7.6
    );
    expect(out.storageSize).toBe(100);
    expect(out.indexSize).toBe(50);
    expect(out.objects).toBe(3);
    expect(out.dbBytes).toBe(150);
    expect(out.fileBytes).toBe(7);
    expect(out.totalBytes).toBe(157);
  });
});

describe('buildLiveDbStats', () => {
  const at = new Date('2026-07-09T12:00:00.000Z');

  it('wraps a live read in the stable envelope with measured:true', () => {
    const env = buildLiveDbStats({
      slug: 'acme',
      dbName: 'tenant_acme',
      raw: { dataSize: 5000, storageSize: 2048, indexSize: 1024, objects: 42 },
      fileBytes: 512,
      generatedAt: at,
    });
    expect(env.format).toBe('pharos.admin-tenant-dbstats');
    expect(env.version).toBe(1);
    expect(env.generatedAt).toBe('2026-07-09T12:00:00.000Z');
    expect(env.slug).toBe('acme');
    expect(env.dbName).toBe('tenant_acme');
    expect(env.measured).toBe(true);
    expect(env.live.totalBytes).toBe(3584);
  });

  it('null raw → measured:false with a zero db footprint', () => {
    const env = buildLiveDbStats({
      slug: 'acme',
      dbName: 'tenant_acme',
      raw: null,
      fileBytes: 0,
      generatedAt: at,
    });
    expect(env.measured).toBe(false);
    expect(env.live.dbBytes).toBe(0);
    expect(env.live.totalBytes).toBe(0);
  });

  it('invalid / absent generatedAt collapses to the epoch', () => {
    const bad = buildLiveDbStats({
      slug: 'acme',
      dbName: 'tenant_acme',
      raw: null,
      fileBytes: 0,
      generatedAt: new Date('nonsense'),
    });
    expect(bad.generatedAt).toBe('1970-01-01T00:00:00.000Z');

    const absent = buildLiveDbStats({
      slug: 'acme',
      dbName: 'tenant_acme',
      raw: null,
      fileBytes: 0,
    });
    expect(absent.generatedAt).toBe('1970-01-01T00:00:00.000Z');
  });

  it('non-string slug / dbName collapse to empty strings', () => {
    const env = buildLiveDbStats({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      slug: 123 as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      dbName: null as any,
      raw: null,
      fileBytes: 0,
      generatedAt: at,
    });
    expect(env.slug).toBe('');
    expect(env.dbName).toBe('');
  });
});
