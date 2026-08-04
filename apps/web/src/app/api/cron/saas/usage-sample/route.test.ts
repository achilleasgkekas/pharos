import { describe, it, expect, vi, beforeEach } from 'vitest';

// POST /api/cron/saas/usage-sample (moved from /api/saas/usage/sample) is the scheduler-driven
// storage-sampling cron: it measures every live tenant's Mongo footprint and writes the billed
// bytes into the Usage ledger. The route is the same CRON_SECRET-bearer idiom as its two
// siblings under /api/cron/saas/ (saasMode gate → shared checkCronAuth → saasGuard-wrapped
// body); the auth ladder now comes from lib/cronAuth.ts instead of a private copy, so these
// cases also pin that the shared helper did not change any answer. Only `sampleAllTenants`
// (lib/billing/dbStats) is mocked at the module boundary:
//   - SAAS_MODE off → 404, never reads CRON_SECRET or calls sampleAllTenants,
//   - CRON_SECRET unset → 500 (fail closed), never calls sampleAllTenants,
//   - missing/wrong/different-length bearer token → 401, never calls sampleAllTenants (the
//     constant-time compare must reject a shorter/longer token without throwing),
//   - correct (trimmed) bearer token → calls sampleAllTenants and returns { ok: true, ...result },
//   - a mid-handler throw (sampleAllTenants rejecting) becomes a clean 500 JSON via the real
//     saasGuard, not an HTML crash page.

const { saasModeMock, sampleAllTenantsMock } = vi.hoisted(() => ({
  saasModeMock: vi.fn(() => true),
  sampleAllTenantsMock: vi.fn(async () => ({ sampled: 0, errors: 0, totalBytes: 0, samples: [] as unknown[] })),
}));

vi.mock('@/lib/tenancy/saasMode', () => ({ saasMode: saasModeMock }));
vi.mock('@/lib/billing/dbStats', () => ({ sampleAllTenants: sampleAllTenantsMock }));

import { POST } from './route';

function makeReq(headers: Record<string, string> = {}): Request {
  return new Request('https://app.example.com/api/cron/saas/usage-sample', {
    method: 'POST',
    headers,
  });
}

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
  process.env = { ...ORIGINAL_ENV, CRON_SECRET: 'cron-secret-123' };
  saasModeMock.mockReturnValue(true);
  sampleAllTenantsMock.mockResolvedValue({ sampled: 0, errors: 0, totalBytes: 0, samples: [] });
});

it('SAAS_MODE off → 404, never reads CRON_SECRET or calls sampleAllTenants', async () => {
  saasModeMock.mockReturnValue(false);
  const res = await POST(makeReq({ authorization: 'Bearer cron-secret-123' }));
  expect(res.status).toBe(404);
  expect(sampleAllTenantsMock).not.toHaveBeenCalled();
});

it('CRON_SECRET unset → 500 (fail closed), never calls sampleAllTenants', async () => {
  delete process.env.CRON_SECRET;
  const res = await POST(makeReq({ authorization: 'Bearer whatever' }));
  expect(res.status).toBe(500);
  expect(sampleAllTenantsMock).not.toHaveBeenCalled();
});

describe('bearer token gate', () => {
  it('missing authorization header → 401, never calls sampleAllTenants', async () => {
    const res = await POST(makeReq());
    expect(res.status).toBe(401);
    expect(sampleAllTenantsMock).not.toHaveBeenCalled();
  });

  it('non-Bearer scheme → 401', async () => {
    const res = await POST(makeReq({ authorization: 'Basic cron-secret-123' }));
    expect(res.status).toBe(401);
    expect(sampleAllTenantsMock).not.toHaveBeenCalled();
  });

  it('wrong token (same length) → 401', async () => {
    const res = await POST(makeReq({ authorization: 'Bearer cron-secret-XXX' }));
    expect(res.status).toBe(401);
    expect(sampleAllTenantsMock).not.toHaveBeenCalled();
  });

  it('wrong token (different length) → 401, does not throw on the constant-time compare', async () => {
    const res = await POST(makeReq({ authorization: 'Bearer short' }));
    expect(res.status).toBe(401);
    expect(sampleAllTenantsMock).not.toHaveBeenCalled();
  });

  it('correct bearer token → calls sampleAllTenants and returns { ok: true, ...result }', async () => {
    const sample = { slug: 'acme', tenantId: 't1', bytes: 4096 };
    sampleAllTenantsMock.mockResolvedValueOnce({ sampled: 1, errors: 0, totalBytes: 4096, samples: [sample] });

    const res = await POST(makeReq({ authorization: 'Bearer cron-secret-123' }));

    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; sampled: number; errors: number; totalBytes: number; samples: unknown[] };
    expect(json).toEqual({ ok: true, sampled: 1, errors: 0, totalBytes: 4096, samples: [sample] });
  });

  it('bearer token with surrounding whitespace is trimmed before compare', async () => {
    const res = await POST(makeReq({ authorization: 'Bearer  cron-secret-123  ' }));
    expect(res.status).toBe(200);
    expect(sampleAllTenantsMock).toHaveBeenCalledTimes(1);
  });
});

it('a mid-handler throw from sampleAllTenants surfaces as a clean 500 JSON via saasGuard, not an HTML crash page', async () => {
  sampleAllTenantsMock.mockRejectedValueOnce(new Error('mongo timeout'));
  const res = await POST(makeReq({ authorization: 'Bearer cron-secret-123' }));
  expect(res.status).toBe(500);
  const json = (await res.json()) as { error: string };
  expect(json.error).toBe('mongo timeout');
});
