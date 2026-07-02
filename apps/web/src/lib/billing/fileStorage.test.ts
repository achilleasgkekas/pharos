import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { sumBytes, tenantStorageRoot, measureDir } from './fileStorage';
import { DEFAULT_TENANT, type TenantContext } from '@/lib/tenancy/context';

// sumBytes + tenantStorageRoot are PURE. measureDir touches the fs, so it runs against a
// real temp directory (node fs is available under vitest). tenantFileBytes is gated by
// saasMode()/isDefault and is exercised via integration once sampling is scheduled.

describe('sumBytes', () => {
  it('sums a list of byte counts', () => {
    expect(sumBytes([100, 200, 300])).toBe(600);
    expect(sumBytes([])).toBe(0);
  });

  it('floors each entry at 0 (garbage / negative sizes do not subtract)', () => {
    expect(sumBytes([100, -50, 25])).toBe(125);
    expect(sumBytes([NaN, 10])).toBe(10);
  });
});

describe('tenantStorageRoot', () => {
  const base = path.resolve(process.env.STORAGE_ROOT ?? path.join(process.cwd(), 'storage'));

  it('returns null for the default (self-hosted) tenant', () => {
    expect(tenantStorageRoot(DEFAULT_TENANT)).toBeNull();
  });

  it('uses STORAGE_ROOT/<dbName> for a SaaS tenant', () => {
    const ctx: TenantContext = {
      tenantId: 'abc', slug: 'acme', dbName: 'tenant_acme',
      plan: 'free', status: 'active', isDefault: false,
    };
    expect(tenantStorageRoot(ctx)).toBe(path.join(base, 'tenant_acme'));
  });

  it('falls back to tenant_<slug> when dbName is empty', () => {
    const ctx: TenantContext = {
      tenantId: 'abc', slug: 'acme', dbName: '',
      plan: 'free', status: 'active', isDefault: false,
    };
    expect(tenantStorageRoot(ctx)).toBe(path.join(base, 'tenant_acme'));
  });

  it('returns null when a crafted dbName would escape STORAGE_ROOT', () => {
    const ctx: TenantContext = {
      tenantId: 'abc', slug: 'acme', dbName: '../../etc',
      plan: 'free', status: 'active', isDefault: false,
    };
    expect(tenantStorageRoot(ctx)).toBeNull();
  });
});

describe('measureDir', () => {
  let dir: string;

  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pharos-fs-'));
    await fs.writeFile(path.join(dir, 'a.txt'), Buffer.alloc(1000));
    const sub = path.join(dir, 'sub', 'deep');
    await fs.mkdir(sub, { recursive: true });
    await fs.writeFile(path.join(dir, 'sub', 'b.txt'), Buffer.alloc(2000));
    await fs.writeFile(path.join(sub, 'c.txt'), Buffer.alloc(500));
  });

  afterAll(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('recursively sums the size of every file in the tree', async () => {
    expect(await measureDir(dir)).toBe(3500);
  });

  it('returns 0 for a missing directory (tenant with no uploads)', async () => {
    expect(await measureDir(path.join(dir, 'does-not-exist'))).toBe(0);
  });
});
