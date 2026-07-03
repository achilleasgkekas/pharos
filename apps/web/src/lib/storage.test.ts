import path from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Fixed storage root so path assertions are deterministic and never touch the
// real filesystem or the developer's cwd.
const ROOT = path.resolve('/srv/pharos-storage');

// Mock node:fs so saveFile/readFile/deleteFile never hit disk. The module under
// test imports `{ promises as fs } from 'node:fs'`, so we only need `promises`.
vi.mock('node:fs', () => ({
  promises: {
    mkdir: vi.fn(async () => undefined),
    writeFile: vi.fn(async () => undefined),
    readFile: vi.fn(async () => Buffer.from('file-bytes')),
    unlink: vi.fn(async () => undefined),
  },
}));

// Grab the mocked fns (this import resolves to the mock above).
let fsMock: {
  mkdir: ReturnType<typeof vi.fn>;
  writeFile: ReturnType<typeof vi.fn>;
  readFile: ReturnType<typeof vi.fn>;
  unlink: ReturnType<typeof vi.fn>;
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
