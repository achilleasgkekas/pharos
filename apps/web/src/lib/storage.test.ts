import path from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Fixed storage root so path assertions are deterministic and never touch the
// real filesystem or the developer's cwd.
const ROOT = path.resolve('/srv/pharos-storage');

// Mock node:fs so saveFile/readFile/deleteFile never hit disk. The module under
// test imports `{ promises as fs } from 'node:fs'`, so we only need `promises`.
// `stat` is used by deleteFile's ledger-size lookup (default: a 4KB file).
vi.mock('node:fs', () => ({
  promises: {
    mkdir: vi.fn(async () => undefined),
    writeFile: vi.fn(async () => undefined),
    readFile: vi.fn(async () => Buffer.from('file-bytes')),
    unlink: vi.fn(async () => undefined),
    stat: vi.fn(async () => ({ size: 4096 })),
  },
}));

// Tenant-awareness mocks. Base implementations match the DEFAULT (self-hosted) tenant exactly —
// tenantStorageRoot → null (fall back to flat STORAGE_ROOT) and the quota gate/ledger are no-ops
// — so every pre-existing test below, which never touches these, keeps exercising the OSS-parity
// path unchanged. Per-test overrides (mockReturnValueOnce / mockRejectedValueOnce) simulate a
// real SaaS tenant in the new "tenant-aware" describe blocks further down.
const currentTenantMock = vi.fn(() => ({ isDefault: true }) as Record<string, unknown>);
vi.mock('@/lib/tenancy/current', () => ({ currentTenant: () => currentTenantMock() }));

const tenantStorageRootMock = vi.fn((_ctx: unknown) => null as string | null);
vi.mock('@/lib/billing/fileStorage', () => ({ tenantStorageRoot: (ctx: unknown) => tenantStorageRootMock(ctx) }));

const assertStorageQuotaMock = vi.fn(async (_bytes: number) => undefined);
const recordStorageDeltaMock = vi.fn(async (_delta: number) => undefined);
vi.mock('@/lib/billing/storageMeter', () => ({
  assertStorageQuota: (n: number) => assertStorageQuotaMock(n),
  recordStorageDelta: (n: number) => recordStorageDeltaMock(n),
}));

// Grab the mocked fns (this import resolves to the mock above).
let fsMock: {
  mkdir: ReturnType<typeof vi.fn>;
  writeFile: ReturnType<typeof vi.fn>;
  readFile: ReturnType<typeof vi.fn>;
  unlink: ReturnType<typeof vi.fn>;
  stat: ReturnType<typeof vi.fn>;
};

let storage: typeof import('./storage');

beforeAll(async () => {
  // STORAGE_ROOT is read once at module-eval time, so it must be set before the
  // dynamic import below.
  process.env.STORAGE_ROOT = ROOT;
  const nodeFs = (await import('node:fs')) as unknown as { promises: typeof fsMock };
  fsMock = nodeFs.promises;
  storage = await import('./storage');
});

afterEach(() => {
  // Clear call history but keep the factory implementations (readFile → Buffer).
  vi.clearAllMocks();
});

describe('saveFile', () => {
  beforeEach(() => {
    // Pin the clock to a UTC noon so the derived year/month are TZ-stable
    // (offsets of ±14h at noon keep the date within June 2026 everywhere).
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-04T12:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns a bucket/year/month/dated-hash relative path', async () => {
    const { relativePath } = await storage.saveFile('receipts', Buffer.from('x'), 'jpg');
    // bucket first, then year/month, then YYYY-MM-DD_<16-hex>.<ext>
    expect(relativePath).toMatch(
      /^receipts[/\\]2026[/\\]06[/\\]\d{4}-\d{2}-\d{2}_[0-9a-f]{16}\.jpg$/
    );
  });

  it('filePath is the relative path joined onto STORAGE_ROOT', async () => {
    const { filePath, relativePath } = await storage.saveFile('expenses', Buffer.from('x'), 'pdf');
    expect(filePath).toBe(path.join(ROOT, relativePath));
    expect(filePath.startsWith(ROOT + path.sep)).toBe(true);
  });

  it('normalizes a bare extension by adding a leading dot', async () => {
    const { relativePath } = await storage.saveFile('statements', Buffer.from('x'), 'pdf');
    expect(relativePath.endsWith('.pdf')).toBe(true);
  });

  it('does not double a dotted extension', async () => {
    const { relativePath } = await storage.saveFile('equipment', Buffer.from('x'), '.png');
    expect(relativePath.endsWith('.png')).toBe(true);
    expect(relativePath.endsWith('..png')).toBe(false);
  });

  it('places the file under its bucket directory', async () => {
    const { relativePath } = await storage.saveFile('equipment', Buffer.from('x'), 'png');
    expect(relativePath.split(/[/\\]/)[0]).toBe('equipment');
  });

  it('creates the target directory recursively and writes the buffer', async () => {
    const buf = Buffer.from('payload-123');
    await storage.saveFile('receipts', buf, 'jpg');
    expect(fsMock.mkdir).toHaveBeenCalledTimes(1);
    expect(fsMock.mkdir.mock.calls[0][1]).toEqual({ recursive: true });
    expect(fsMock.writeFile).toHaveBeenCalledTimes(1);
    expect(fsMock.writeFile.mock.calls[0][1]).toBe(buf);
  });

  it('generates a unique filename per call (random hash)', async () => {
    const a = await storage.saveFile('receipts', Buffer.from('x'), 'jpg');
    const b = await storage.saveFile('receipts', Buffer.from('x'), 'jpg');
    expect(a.relativePath).not.toBe(b.relativePath);
  });
});

describe('readFile — path-traversal guard', () => {
  it('reads a legitimate relative path from inside the root', async () => {
    const rel = 'receipts/2026/06/file.jpg';
    const out = await storage.readFile(rel);
    expect(out).toEqual(Buffer.from('file-bytes'));
    expect(fsMock.readFile).toHaveBeenCalledTimes(1);
    expect(fsMock.readFile.mock.calls[0][0]).toBe(path.resolve(ROOT, rel));
  });

  it('allows a "../" that normalizes back inside the root', async () => {
    // receipts/../statements/x.pdf → statements/x.pdf (still inside root)
    await storage.readFile('receipts/../statements/x.pdf');
    expect(fsMock.readFile.mock.calls[0][0]).toBe(path.resolve(ROOT, 'statements/x.pdf'));
  });

  it('reads from the ambient tenant subtree when one is resolved, not the flat root', async () => {
    const tenantRoot = path.resolve(ROOT, 'tenant_acme');
    tenantStorageRootMock.mockReturnValueOnce(tenantRoot);
    await storage.readFile('receipts/2026/06/file.jpg');
    expect(fsMock.readFile.mock.calls[0][0]).toBe(path.resolve(tenantRoot, 'receipts/2026/06/file.jpg'));
  });

  it('rejects a "../" traversal that escapes the root', async () => {
    await expect(storage.readFile('../../etc/passwd')).rejects.toThrow('Path escapes storage root');
    expect(fsMock.readFile).not.toHaveBeenCalled();
  });

  it('rejects an absolute path', async () => {
    await expect(storage.readFile('/etc/passwd')).rejects.toThrow('Path escapes storage root');
    expect(fsMock.readFile).not.toHaveBeenCalled();
  });

  it('rejects an empty path (resolves to the root itself)', async () => {
    await expect(storage.readFile('')).rejects.toThrow('Path escapes storage root');
    expect(fsMock.readFile).not.toHaveBeenCalled();
  });

  it('rejects a nested path that climbs out via "../"', async () => {
    await expect(storage.readFile('receipts/../../secret')).rejects.toThrow(
      'Path escapes storage root'
    );
    expect(fsMock.readFile).not.toHaveBeenCalled();
  });
});

describe('deleteFile — path-traversal guard', () => {
  it('unlinks a legitimate relative path', async () => {
    const rel = 'statements/2026/06/s.pdf';
    await storage.deleteFile(rel);
    expect(fsMock.unlink).toHaveBeenCalledTimes(1);
    expect(fsMock.unlink.mock.calls[0][0]).toBe(path.resolve(ROOT, rel));
  });

  it('rejects a traversal escape and never unlinks', async () => {
    await expect(storage.deleteFile('../../../root/.ssh/id_rsa')).rejects.toThrow(
      'Path escapes storage root'
    );
    expect(fsMock.unlink).not.toHaveBeenCalled();
  });

  it('rejects an absolute path and never unlinks', async () => {
    await expect(storage.deleteFile('/var/log/syslog')).rejects.toThrow('Path escapes storage root');
    expect(fsMock.unlink).not.toHaveBeenCalled();
  });
});

describe('saveFile — tenant-aware storage root + quota (P — storage quota enforcement)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-05T12:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('writes under the tenant subtree when tenantStorageRoot resolves one (real SaaS tenant)', async () => {
    const tenantRoot = path.resolve(ROOT, 'tenant_acme');
    tenantStorageRootMock.mockReturnValueOnce(tenantRoot);
    const { filePath, relativePath } = await storage.saveFile('receipts', Buffer.from('x'), 'jpg');
    expect(filePath).toBe(path.join(tenantRoot, relativePath));
    expect(filePath.startsWith(tenantRoot + path.sep)).toBe(true);
    expect(fsMock.mkdir.mock.calls[0][0]).toBe(path.dirname(filePath));
    // The returned relativePath is bucket-relative, never prefixed with the tenant subtree —
    // readFile/deleteFile re-derive the tenant root from the ambient tenant at call time.
    expect(relativePath.split(/[/\\]/)[0]).toBe('receipts');
  });

  it('falls back to the flat STORAGE_ROOT when tenantStorageRoot returns null (self-hosted default tenant)', async () => {
    tenantStorageRootMock.mockReturnValueOnce(null);
    const { filePath } = await storage.saveFile('receipts', Buffer.from('x'), 'jpg');
    expect(filePath.startsWith(ROOT + path.sep)).toBe(true);
  });

  it('asserts the quota with the buffer length BEFORE writing anything', async () => {
    const buf = Buffer.from('twelve bytes');
    await storage.saveFile('receipts', buf, 'jpg');
    expect(assertStorageQuotaMock).toHaveBeenCalledWith(buf.length);
    // Called before mkdir/writeFile: had it been checked after, an over-quota write would
    // already have happened once (the exact bug this gate exists to prevent).
    const quotaCallOrder = assertStorageQuotaMock.mock.invocationCallOrder[0];
    const mkdirCallOrder = fsMock.mkdir.mock.invocationCallOrder[0];
    expect(quotaCallOrder).toBeLessThan(mkdirCallOrder);
  });

  it('an over-quota tenant never gets a partial write: mkdir/writeFile are never called', async () => {
    assertStorageQuotaMock.mockRejectedValueOnce(new Error('Storage limit reached for this plan'));
    await expect(storage.saveFile('receipts', Buffer.from('x'), 'jpg')).rejects.toThrow('Storage limit reached');
    expect(fsMock.mkdir).not.toHaveBeenCalled();
    expect(fsMock.writeFile).not.toHaveBeenCalled();
    expect(recordStorageDeltaMock).not.toHaveBeenCalled();
  });

  it('records a positive ledger delta of exactly the buffer length after a successful write', async () => {
    const buf = Buffer.from('payload-123456');
    await storage.saveFile('receipts', buf, 'jpg');
    expect(recordStorageDeltaMock).toHaveBeenCalledWith(buf.length);
  });
});

describe('deleteFile — ledger delta', () => {
  it('stats the file, unlinks it, then records a NEGATIVE delta of its size', async () => {
    fsMock.stat.mockResolvedValueOnce({ size: 2048 });
    await storage.deleteFile('receipts/2026/06/file.jpg');
    expect(fsMock.unlink).toHaveBeenCalledTimes(1);
    expect(recordStorageDeltaMock).toHaveBeenCalledWith(-2048);
  });

  it('still unlinks (and never calls the ledger) when stat fails — best-effort, delete is not blocked', async () => {
    fsMock.stat.mockRejectedValueOnce(new Error('ENOENT'));
    await storage.deleteFile('receipts/2026/06/gone.jpg');
    expect(fsMock.unlink).toHaveBeenCalledTimes(1);
    expect(recordStorageDeltaMock).not.toHaveBeenCalled();
  });

  it('resolves the stat/unlink target under the ambient tenant root, same as reads', async () => {
    const tenantRoot = path.resolve(ROOT, 'tenant_acme');
    tenantStorageRootMock.mockReturnValueOnce(tenantRoot);
    await storage.deleteFile('statements/2026/06/s.pdf');
    expect(fsMock.stat.mock.calls[0][0]).toBe(path.resolve(tenantRoot, 'statements/2026/06/s.pdf'));
    expect(fsMock.unlink.mock.calls[0][0]).toBe(path.resolve(tenantRoot, 'statements/2026/06/s.pdf'));
  });
});
