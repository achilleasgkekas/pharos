import { describe, it, expect, vi, beforeEach } from 'vitest';

// POST /api/cron/saas/suspended-sweep enforces the 30-day keep-window for suspended workspaces.
// The sweep's own decision logic (window math, filters, email copy, the erasure $set) is unit-tested
// in `suspendedSweep.test.ts`; only `runSuspendedSweep` is mocked at the module boundary here,
// alongside `saasMode`. What the ROUTE owes, and what this locks:
//   - SAAS_MODE off → 404, never reads CRON_SECRET or calls the sweep,
//   - CRON_SECRET unset → 500 (fail closed), never calls the sweep,
//   - missing/wrong bearer → 401 (including a different-length token, which the constant-time
//     compare must reject rather than throw),
//   - correct bearer → 200 with the sweep counters,
//   - a mid-handler throw surfaces as clean 500 JSON, not an HTML crash page.
// The gate matters more here than on the report-only endpoints: this route SCHEDULES deletions.

const { saasModeMock, runSuspendedSweepMock } = vi.hoisted(() => ({
  saasModeMock: vi.fn(() => true),
  runSuspendedSweepMock: vi.fn(async () => ({
    swept: true,
    backfilled: 0,
    warned: 0,
    warnFailed: 0,
    scheduled: 0,
    scheduleFailed: 0,
  })),
}));

vi.mock('@/lib/tenancy/saasMode', () => ({ saasMode: saasModeMock }));
vi.mock('@/lib/tenancy/suspendedSweep', () => ({ runSuspendedSweep: runSuspendedSweepMock }));

import { POST } from './route';

const ZERO = { swept: true, backfilled: 0, warned: 0, warnFailed: 0, scheduled: 0, scheduleFailed: 0 };

function makeReq(headers: Record<string, string> = {}): Request {
  return new Request('https://app.example.com/api/cron/saas/suspended-sweep', {
    method: 'POST',
    headers,
  });
}

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
  process.env = { ...ORIGINAL_ENV, CRON_SECRET: 'cron-secret-123' };
  saasModeMock.mockReturnValue(true);
  runSuspendedSweepMock.mockResolvedValue({ ...ZERO });
});

it('SAAS_MODE off → 404, never reads CRON_SECRET or calls the sweep', async () => {
  saasModeMock.mockReturnValue(false);
  const res = await POST(makeReq({ authorization: 'Bearer cron-secret-123' }));
  expect(res.status).toBe(404);
  expect(runSuspendedSweepMock).not.toHaveBeenCalled();
});

it('CRON_SECRET unset → 500 (fail closed), never calls the sweep', async () => {
  delete process.env.CRON_SECRET;
  const res = await POST(makeReq({ authorization: 'Bearer whatever' }));
  expect(res.status).toBe(500);
  expect(runSuspendedSweepMock).not.toHaveBeenCalled();
});

describe('bearer token gate', () => {
  it('missing authorization header → 401, never calls the sweep', async () => {
    const res = await POST(makeReq());
    expect(res.status).toBe(401);
    expect(runSuspendedSweepMock).not.toHaveBeenCalled();
  });

  it('non-Bearer scheme → 401', async () => {
    const res = await POST(makeReq({ authorization: 'Basic cron-secret-123' }));
    expect(res.status).toBe(401);
    expect(runSuspendedSweepMock).not.toHaveBeenCalled();
  });

  it('wrong token (same length) → 401', async () => {
    const res = await POST(makeReq({ authorization: 'Bearer cron-secret-XXX' }));
    expect(res.status).toBe(401);
    expect(runSuspendedSweepMock).not.toHaveBeenCalled();
  });

  it('wrong token (different length) → 401, does not throw on the constant-time compare', async () => {
    const res = await POST(makeReq({ authorization: 'Bearer short' }));
    expect(res.status).toBe(401);
    expect(runSuspendedSweepMock).not.toHaveBeenCalled();
  });

  it('correct bearer token → calls the sweep and returns its counters as { ok: true, ...result }', async () => {
    runSuspendedSweepMock.mockResolvedValueOnce({
      swept: true,
      backfilled: 2,
      warned: 1,
      warnFailed: 0,
      scheduled: 3,
      scheduleFailed: 1,
    });
    const res = await POST(makeReq({ authorization: 'Bearer cron-secret-123' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      swept: true,
      backfilled: 2,
      warned: 1,
      warnFailed: 0,
      scheduled: 3,
      scheduleFailed: 1,
    });
  });
});

it('a mid-handler throw from the sweep surfaces as a clean 500 JSON, not an HTML crash page', async () => {
  runSuspendedSweepMock.mockRejectedValueOnce(new Error('mongo timeout'));
  const res = await POST(makeReq({ authorization: 'Bearer cron-secret-123' }));
  expect(res.status).toBe(500);
  expect(((await res.json()) as { error: string }).error).toBe('mongo timeout');
});
