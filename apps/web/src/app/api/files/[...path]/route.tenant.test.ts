import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// GET /api/files/<path> serves the binary attachments (receipt PDFs, statement PDFs, item
// photos) straight off the storage volume. It is the ONE route that turns a URL segment into a
// filesystem read, and before this file it had no tenancy coverage at all — which is how #190
// stayed open: the handler authenticated the caller but never established WHICH workspace it
// was reading for.
//
// The two things pinned here, and why each one matters:
//
//  1. THE ROOT. `lib/storage.ts readFile()` resolves its argument under `activeStorageRoot()`,
//     derived from the AMBIENT tenant (`currentTenant()`) exactly as `currentModel()` picks the
//     database. With no ambient tenant that root is the FLAT STORAGE_ROOT, while a hosted
//     workspace's files live in the subtree STORAGE_ROOT/<dbName>. So the route read from the
//     wrong root for every hosted workspace — and because every tenant subtree sits INSIDE that
//     flat root, `/api/files/tenant_beta/receipts/…` resolved cleanly and served another
//     workspace's file. The traversal guard in `resolveWithinStorage` could not help: with the
//     root one level too high, the other tenant's path never escapes it.
//
//  2. THE CREDENTIAL. `verifySession` is a bare JWT check against a fleet-wide secret, so it
//     proves "a valid Pharos user", NOT "a user of the workspace this host names". The fix
//     follows `lib/apiAuth.ts`'s stated rule: the HOST decides the workspace, and the credential
//     is then looked up in THAT workspace's own database, so a foreign one is simply not found.
//
// The filesystem, the control plane and the session seams are mocked. The tenant plumbing
// (`withTenant` / `currentTenant` / `activeStorageRoot`) runs for REAL, because "which root did
// the read land in" is the entire claim under test — mocking it would test the mock.

// storage.ts freezes STORAGE_ROOT at module load, so the temp volume has to exist in the
// environment before ANY import runs — hence a hoisted block rather than beforeAll.
const { STORAGE_ROOT } = vi.hoisted(() => {
  const os = require('node:os') as typeof import('node:os');
  const path = require('node:path') as typeof import('node:path');
  const fs = require('node:fs') as typeof import('node:fs');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pharos-files-idor-'));
  process.env.STORAGE_ROOT = root;
  return { STORAGE_ROOT: root };
});

const {
  readFileMock,
  recacheByPathMock,
  apiTenantMock,
  verifySessionMock,
  bearerUserMock,
  saasModeMock,
  userExistsMock,
  saasSessionUserMock,
} = vi.hoisted(() => ({
  readFileMock: vi.fn(),
  recacheByPathMock: vi.fn(),
  apiTenantMock: vi.fn(),
  verifySessionMock: vi.fn(),
  bearerUserMock: vi.fn(),
  saasModeMock: vi.fn(),
  userExistsMock: vi.fn(),
  saasSessionUserMock: vi.fn(),
}));

// The storage seam OBSERVES but does not replace: every call is delegated to the real
// `readFile`, so the resolution against `activeStorageRoot()` — the behaviour under test — runs
// for real against real files on a real temp volume. The spy exists only to record which root
// was ambient at that moment.
vi.mock('@/lib/storage', async () => {
  const actual = await vi.importActual<typeof import('@/lib/storage')>('@/lib/storage');
  return { ...actual, readFile: readFileMock };
});
vi.mock('@/lib/mirror', () => ({ recacheByPath: recacheByPathMock }));
vi.mock('@/lib/session', async () => {
  const actual = await vi.importActual<typeof import('@/lib/session')>('@/lib/session');
  return { ...actual, verifySession: verifySessionMock };
});
vi.mock('@/lib/apiAuth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/apiAuth')>('@/lib/apiAuth');
  return { ...actual, bearerUser: bearerUserMock, apiTenant: apiTenantMock };
});
vi.mock('@/lib/tenancy/saasMode', () => ({ saasMode: saasModeMock }));
vi.mock('@/lib/tenancy/saasIdentity', () => ({ saasSessionUser: saasSessionUserMock }));
vi.mock('@/lib/tenancy/connection', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/tenancy/connection')>('@/lib/tenancy/connection');
  return { ...actual, currentModel: vi.fn(async () => ({ exists: userExistsMock })) };
});
vi.mock('@/lib/db', () => ({ connectDB: vi.fn(async () => undefined) }));

import { GET } from './route';
import { activeStorageRoot } from '@/lib/storage';
import { DEFAULT_TENANT, type TenantContext } from '@/lib/tenancy/context';

const ALPHA = {
  tenantId: 't-alpha',
  slug: 'alpha',
  dbName: 'tenant_alpha',
  isDefault: false,
  status: 'active',
} as unknown as TenantContext;

const SESSION_USER_ID = '507f1f77bcf86cd799439011';

/** The storage root that was ambient during the most recent readFile call. */
let rootDuringRead = '';

// Two real files, one per workspace, so "did it serve the wrong tenant's bytes" is answered by
// the bytes themselves and not by a file happening to be absent.
const ALPHA_BYTES = 'alpha-invoice';
const BETA_BYTES = 'beta-secret';

function makeReq(): NextRequest {
  return {
    cookies: { get: () => ({ value: 'a-signed-token' }) },
    headers: new Headers(),
  } as unknown as NextRequest;
}

function call(segments: string[]) {
  return GET(makeReq(), { params: Promise.resolve({ path: segments }) });
}

beforeAll(async () => {
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  for (const [db, bytes] of [['tenant_alpha', ALPHA_BYTES], ['tenant_beta', BETA_BYTES]] as const) {
    const dir = path.join(STORAGE_ROOT, db, 'receipts', '2026', '01');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, db === 'tenant_alpha' ? 'invoice.pdf' : 'secret.pdf'), bytes);
  }
});

afterAll(async () => {
  const fs = await import('node:fs/promises');
  await fs.rm(STORAGE_ROOT, { recursive: true, force: true });
});

beforeEach(() => {
  vi.clearAllMocks();
  rootDuringRead = '';
  saasModeMock.mockReturnValue(true);
  apiTenantMock.mockResolvedValue(ALPHA);
  // A signed cookie whose user really does live in alpha's database.
  verifySessionMock.mockResolvedValue({ sub: SESSION_USER_ID, role: 'member', name: 'A' });
  userExistsMock.mockResolvedValue({ _id: SESSION_USER_ID });
  bearerUserMock.mockResolvedValue(null);
  saasSessionUserMock.mockResolvedValue(null);
  recacheByPathMock.mockResolvedValue(null);
  readFileMock.mockImplementation(async (rel: string) => {
    rootDuringRead = activeStorageRoot();
    const actual = await vi.importActual<typeof import('@/lib/storage')>('@/lib/storage');
    return actual.readFile(rel);
  });
});

describe('GET /api/files — tenant scoping (#190)', () => {
  it('reads under the workspace subtree the host names, not the flat storage root', async () => {
    const res = await call(['receipts', '2026', '01', 'invoice.pdf']);

    expect(res.status).toBe(200);
    expect(await res.text()).toBe(ALPHA_BYTES);
    expect(readFileMock).toHaveBeenCalledWith('receipts/2026/01/invoice.pdf');
    // The bug in one assertion: with no ambient tenant this was the bare STORAGE_ROOT, where
    // that same relative path does not exist at all.
    expect(rootDuringRead.endsWith('/tenant_alpha')).toBe(true);
  });

  it('cannot reach another workspace by prefixing its database name (the IDOR)', async () => {
    // Alpha's session asking for beta's subtree. Beta's file REALLY EXISTS on the volume, so a
    // 404 here can only mean the read was confined: pinned to STORAGE_ROOT/tenant_alpha the
    // path escapes the root and resolveWithinStorage throws. Under the old flat root the very
    // same request resolved happily and handed back beta's bytes.
    const res = await call(['tenant_beta', 'receipts', '2026', '01', 'secret.pdf']);

    expect(res.status).toBe(404);
    expect(await res.text()).not.toContain(BETA_BYTES);
  });

  it('denies a validly-signed session whose user does not exist in this workspace', async () => {
    userExistsMock.mockResolvedValue(null); // alpha's database has never heard of this user

    const res = await call(['receipts', '2026', '01', 'invoice.pdf']);

    expect(res.status).toBe(401);
    expect(readFileMock).not.toHaveBeenCalled();
  });

  it('accepts a hosted Account that is a member of the workspace', async () => {
    verifySessionMock.mockResolvedValue(null); // no self-hosted cookie at all
    saasSessionUserMock.mockResolvedValue({ id: 'acct-1', role: 'member', name: 'a@example.com' });

    const res = await call(['receipts', '2026', '01', 'invoice.pdf']);

    expect(res.status).toBe(200);
  });

  it('refuses a host that names no workspace, before touching the filesystem', async () => {
    apiTenantMock.mockResolvedValue({ status: 404, error: 'No such workspace' });

    const res = await call(['receipts', '2026', '01', 'invoice.pdf']);

    expect(res.status).toBe(404);
    expect(readFileMock).not.toHaveBeenCalled();
  });

  it('SELF-HOSTED PARITY: SAAS_MODE off keeps the flat root and the bare session cookie', async () => {
    saasModeMock.mockReturnValue(false);
    apiTenantMock.mockResolvedValue(DEFAULT_TENANT);
    userExistsMock.mockResolvedValue(null); // must not be consulted at all when SaaS is off

    // The default tenant has no subtree: the whole STORAGE_ROOT is the single installation's,
    // so address the file the way a self-hosted install stores it.
    const res = await call(['tenant_alpha', 'receipts', '2026', '01', 'invoice.pdf']);

    expect(res.status).toBe(200);
    expect(await res.text()).toBe(ALPHA_BYTES);
    expect(rootDuringRead).toBe(STORAGE_ROOT);
    expect(userExistsMock).not.toHaveBeenCalled();
  });
});
