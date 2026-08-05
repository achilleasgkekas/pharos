import { describe, it, expect, vi, beforeEach } from 'vitest';

// POST /api/cron/saas/erasure-purge (moved from /api/saas/workspace/erasure/purge) is the
// scheduler-driven GDPR Art. 17 purge SCAN. The scan's own reporting logic (`planErasurePurge`/`daysOverdue`/`purgeTarget`) is
// already fully unit-tested in `erasurePurge.test.ts` and runs for REAL here (only
// `runErasurePurgeScan` is mocked at the module boundary, alongside `saasMode`). This closes
// the gap for what the ROUTE itself is responsible for:
//   - SAAS_MODE off → 404, never reads CRON_SECRET or calls the scan,
//   - CRON_SECRET unset → 500 (fail closed), never calls the scan,
//   - missing/wrong bearer token → 401, never calls the scan (including a same-prefix but
//     different-length token, which the constant-time compare must reject, not throw),
//   - correct bearer token → 200 with the scan result,
//   - a mid-handler throw from the scan surfaces as a clean 500 JSON, not an HTML crash page.

const { saasModeMock, runErasurePurgeScanMock, runErasurePurgeExecuteMock } = vi.hoisted(() => ({
  saasModeMock: vi.fn(() => true),
  runErasurePurgeScanMock: vi.fn(async () => ({ scanned: true, dryRun: true as const, due: 0, targets: [] as unknown[] })),
  // Disarmed is the DEFAULT state of the execute pass, so that is what the fixture returns.
  runErasurePurgeExecuteMock: vi.fn(async () => ({
    executed: false,
    reason: 'SAAS_PURGE_EXECUTE is not armed',
    purged: 0,
    failed: 0,
    deferred: 0,
    outcomes: [] as unknown[],
  })),
}));

vi.mock('@/lib/tenancy/saasMode', () => ({ saasMode: saasModeMock }));
vi.mock('@/lib/tenancy/erasurePurge', () => ({ runErasurePurgeScan: runErasurePurgeScanMock }));
vi.mock('@/lib/tenancy/purgeExecute', () => ({ runErasurePurgeExecute: runErasurePurgeExecuteMock }));

import { POST } from './route';

function makeReq(headers: Record<string, string> = {}): Request {
  return new Request('https://app.example.com/api/cron/saas/erasure-purge', {
    method: 'POST',
    headers,
  });
}

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
  process.env = { ...ORIGINAL_ENV, CRON_SECRET: 'cron-secret-123' };
  saasModeMock.mockReturnValue(true);
  runErasurePurgeScanMock.mockResolvedValue({ scanned: true, dryRun: true, due: 0, targets: [] });
});

it('SAAS_MODE off → 404, never reads CRON_SECRET or calls the scan', async () => {
  saasModeMock.mockReturnValue(false);
  const res = await POST(makeReq({ authorization: 'Bearer cron-secret-123' }));
  expect(res.status).toBe(404);
  expect(runErasurePurgeScanMock).not.toHaveBeenCalled();
});

it('CRON_SECRET unset → 500 (fail closed), never calls the scan', async () => {
  delete process.env.CRON_SECRET;
  const res = await POST(makeReq({ authorization: 'Bearer whatever' }));
  expect(res.status).toBe(500);
  expect(runErasurePurgeScanMock).not.toHaveBeenCalled();
});

describe('bearer token gate', () => {
  it('missing authorization header → 401, never calls the scan', async () => {
    const res = await POST(makeReq());
    expect(res.status).toBe(401);
    expect(runErasurePurgeScanMock).not.toHaveBeenCalled();
  });

  it('non-Bearer scheme → 401', async () => {
    const res = await POST(makeReq({ authorization: 'Basic cron-secret-123' }));
    expect(res.status).toBe(401);
    expect(runErasurePurgeScanMock).not.toHaveBeenCalled();
  });

  it('wrong token (same length) → 401', async () => {
    const res = await POST(makeReq({ authorization: 'Bearer cron-secret-XXX' }));
    expect(res.status).toBe(401);
    expect(runErasurePurgeScanMock).not.toHaveBeenCalled();
  });

  it('wrong token (different length) → 401, does not throw on the constant-time compare', async () => {
    const res = await POST(makeReq({ authorization: 'Bearer short' }));
    expect(res.status).toBe(401);
    expect(runErasurePurgeScanMock).not.toHaveBeenCalled();
  });

  it('correct bearer token → calls the scan and returns its result as { ok: true, ...result }', async () => {
    const target = {
      id: 't1',
      slug: 'acme',
      dbName: 'tenant_acme',
      requestedAt: '2026-05-01T00:00:00.000Z',
      scheduledAt: '2026-06-01T00:00:00.000Z',
      requestedBy: 'acc1',
      daysOverdue: 3,
    };
    runErasurePurgeScanMock.mockResolvedValueOnce({ scanned: true, dryRun: true, due: 1, targets: [target] });
    const res = await POST(makeReq({ authorization: 'Bearer cron-secret-123' }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json).toEqual({
      ok: true,
      scanned: true,
      dryRun: true,
      due: 1,
      targets: [target],
      // The execute pass reports itself separately, so a reader can tell "nothing was due" from
      // "something was due and we are not allowed to touch it".
      execute: {
        executed: false,
        reason: 'SAAS_PURGE_EXECUTE is not armed',
        purged: 0,
        failed: 0,
        deferred: 0,
        outcomes: [],
      },
    });
  });

  it('reports what the execute pass actually did when it IS armed', async () => {
    runErasurePurgeExecuteMock.mockResolvedValueOnce({
      executed: true,
      reason: null as unknown as string,
      purged: 2,
      failed: 1,
      deferred: 3,
      outcomes: [],
    });
    const res = await POST(makeReq({ authorization: 'Bearer cron-secret-123' }));
    const json = (await res.json()) as { execute: { purged: number; failed: number; deferred: number } };
    expect(json.execute).toMatchObject({ purged: 2, failed: 1, deferred: 3 });
  });

  it('never runs the execute pass when SAAS_MODE is off', async () => {
    saasModeMock.mockReturnValue(false);
    await POST(makeReq({ authorization: 'Bearer cron-secret-123' }));
    expect(runErasurePurgeExecuteMock).not.toHaveBeenCalled();
  });

  it('never runs the execute pass without a valid token', async () => {
    await POST(makeReq({ authorization: 'Bearer wrong-secret-xx' }));
    expect(runErasurePurgeExecuteMock).not.toHaveBeenCalled();
  });

  it('bearer token with surrounding whitespace is trimmed before compare', async () => {
    const res = await POST(makeReq({ authorization: 'Bearer  cron-secret-123  ' }));
    expect(res.status).toBe(200);
    expect(runErasurePurgeScanMock).toHaveBeenCalledTimes(1);
  });
});

it('a mid-handler throw from the scan surfaces as a clean 500 JSON, not an HTML crash page', async () => {
  runErasurePurgeScanMock.mockRejectedValueOnce(new Error('mongo timeout'));
  const res = await POST(makeReq({ authorization: 'Bearer cron-secret-123' }));
  expect(res.status).toBe(500);
  const json = (await res.json()) as { error: string };
  expect(json.error).toBe('mongo timeout');
});
