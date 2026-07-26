import { describe, it, expect, vi, beforeEach } from 'vitest';

// POST /api/saas/trials/sweep is the on-demand / external trigger for the D4 trial-lapse sweep
// (warn tenants 3 days out, suspend tenants whose trial already lapsed). Zero route-level
// coverage before this file. The sweep's own decision core (`shouldWarnTrial`/`planTrialWarnings`/
// `trialWarningFilter`/`dunningEmail` + the lapse planners) is already fully unit-tested in
// `trialSweep.test.ts` / `trialLapse.test.ts`, so only `runTrialLapseSweep` is mocked at the
// module boundary here (alongside `saasMode`). `saasGuard` is pure and runs for REAL, so the
// mid-throw test exercises the production error shaping. This file covers what the ROUTE owns:
//   - SAAS_MODE off → 404 BEFORE the CRON_SECRET read (an unconfigured self-hoster gets "does
//     not exist", never "misconfigured"), and never runs the sweep,
//   - CRON_SECRET unset → 500 fail-closed, never runs the sweep,
//   - the bearer gate: missing / wrong scheme / wrong token (same AND different length, the
//     latter must be rejected by the length-guard, not throw inside timingSafeEqual) → 401,
//     with the sweep untouched in every case,
//   - a correct token runs the sweep exactly once with NO explicit `now` (the route must not
//     pin a clock — the runner's own default must win) and echoes every result counter,
//   - the runner's own SaaS-off no-op (`swept:false`) still surfaces as a 200, not an error,
//   - a mid-handler throw becomes a clean `{ error }` 500 JSON, not an HTML crash page.

type SweepResult = {
  swept: boolean;
  warned: number;
  warnFailed: number;
  suspended: number;
  suspendFailed: number;
};

const ZERO: SweepResult = { swept: true, warned: 0, warnFailed: 0, suspended: 0, suspendFailed: 0 };

const { saasModeMock, runTrialLapseSweepMock } = vi.hoisted(() => ({
  saasModeMock: vi.fn(() => true),
  runTrialLapseSweepMock: vi.fn(
    async (_now?: Date): Promise<SweepResult> => ({
      swept: true,
      warned: 0,
      warnFailed: 0,
      suspended: 0,
      suspendFailed: 0,
    }),
  ),
}));

vi.mock('@/lib/tenancy/saasMode', () => ({ saasMode: saasModeMock }));
vi.mock('@/lib/billing/trialSweep', () => ({ runTrialLapseSweep: runTrialLapseSweepMock }));

import { POST } from './route';

function makeReq(headers: Record<string, string> = {}): Request {
  return new Request('https://app.example.com/api/saas/trials/sweep', { method: 'POST', headers });
}

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
  process.env = { ...ORIGINAL_ENV, CRON_SECRET: 'cron-secret-123' };
  saasModeMock.mockReturnValue(true);
  runTrialLapseSweepMock.mockResolvedValue({ ...ZERO });
});

describe('mode + configuration gates', () => {
  it('SAAS_MODE off → 404, never runs the sweep', async () => {
    saasModeMock.mockReturnValue(false);
    const res = await POST(makeReq({ authorization: 'Bearer cron-secret-123' }));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'SaaS mode is not enabled' });
    expect(runTrialLapseSweepMock).not.toHaveBeenCalled();
  });

  it('SAAS_MODE off wins over a missing CRON_SECRET → 404, not 500', async () => {
    // Ordering matters: a self-hoster with neither flag set must be told the endpoint does not
    // exist, never that the server is misconfigured (the secret is irrelevant to them).
    saasModeMock.mockReturnValue(false);
    delete process.env.CRON_SECRET;
    const res = await POST(makeReq());
    expect(res.status).toBe(404);
    expect(runTrialLapseSweepMock).not.toHaveBeenCalled();
  });

  it('CRON_SECRET unset → 500 (fail closed), never runs the sweep', async () => {
    delete process.env.CRON_SECRET;
    const res = await POST(makeReq({ authorization: 'Bearer whatever' }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'CRON_SECRET is not configured' });
    expect(runTrialLapseSweepMock).not.toHaveBeenCalled();
  });

  it('CRON_SECRET set to an empty string is treated as unset → 500, never runs the sweep', async () => {
    process.env.CRON_SECRET = '';
    const res = await POST(makeReq({ authorization: 'Bearer ' }));
    expect(res.status).toBe(500);
    expect(runTrialLapseSweepMock).not.toHaveBeenCalled();
  });
});

describe('bearer token gate', () => {
  it('missing authorization header → 401, never runs the sweep', async () => {
    const res = await POST(makeReq());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthorized' });
    expect(runTrialLapseSweepMock).not.toHaveBeenCalled();
  });

  it('non-Bearer scheme → 401', async () => {
    const res = await POST(makeReq({ authorization: 'Basic cron-secret-123' }));
    expect(res.status).toBe(401);
    expect(runTrialLapseSweepMock).not.toHaveBeenCalled();
  });

  it('lowercase "bearer" scheme → 401 (the prefix match is case-sensitive)', async () => {
    const res = await POST(makeReq({ authorization: 'bearer cron-secret-123' }));
    expect(res.status).toBe(401);
    expect(runTrialLapseSweepMock).not.toHaveBeenCalled();
  });

  it('"Bearer" with an empty token → 401, never runs the sweep', async () => {
    const res = await POST(makeReq({ authorization: 'Bearer    ' }));
    expect(res.status).toBe(401);
    expect(runTrialLapseSweepMock).not.toHaveBeenCalled();
  });

  it('wrong token (same length) → 401', async () => {
    const res = await POST(makeReq({ authorization: 'Bearer cron-secret-XXX' }));
    expect(res.status).toBe(401);
    expect(runTrialLapseSweepMock).not.toHaveBeenCalled();
  });

  it('wrong token (different length) → 401, does not throw on the constant-time compare', async () => {
    // timingSafeEqual throws on differing buffer lengths; the length guard must short-circuit
    // first, otherwise a one-character probe would 500 instead of 401 (and leak length info).
    const res = await POST(makeReq({ authorization: 'Bearer c' }));
    expect(res.status).toBe(401);
    expect(runTrialLapseSweepMock).not.toHaveBeenCalled();
  });

  it('a correct-prefix token with extra trailing characters → 401', async () => {
    const res = await POST(makeReq({ authorization: 'Bearer cron-secret-123extra' }));
    expect(res.status).toBe(401);
    expect(runTrialLapseSweepMock).not.toHaveBeenCalled();
  });

  it('correct bearer token → 200 and runs the sweep exactly once', async () => {
    const res = await POST(makeReq({ authorization: 'Bearer cron-secret-123' }));
    expect(res.status).toBe(200);
    expect(runTrialLapseSweepMock).toHaveBeenCalledTimes(1);
  });

  it('surrounding whitespace inside the header is trimmed before the compare', async () => {
    const res = await POST(makeReq({ authorization: 'Bearer  cron-secret-123  ' }));
    expect(res.status).toBe(200);
    expect(runTrialLapseSweepMock).toHaveBeenCalledTimes(1);
  });

  it('the header lookup is case-insensitive (Authorization vs authorization)', async () => {
    const res = await POST(makeReq({ Authorization: 'Bearer cron-secret-123' }));
    expect(res.status).toBe(200);
    expect(runTrialLapseSweepMock).toHaveBeenCalledTimes(1);
  });
});

describe('sweep invocation + result passthrough', () => {
  it('calls the runner with NO explicit clock, so the runner default (real now) wins', async () => {
    await POST(makeReq({ authorization: 'Bearer cron-secret-123' }));
    expect(runTrialLapseSweepMock).toHaveBeenCalledWith();
  });

  it('echoes every counter of a working sweep as { ok: true, ...result }', async () => {
    runTrialLapseSweepMock.mockResolvedValueOnce({
      swept: true,
      warned: 4,
      warnFailed: 1,
      suspended: 2,
      suspendFailed: 3,
    });
    const res = await POST(makeReq({ authorization: 'Bearer cron-secret-123' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      swept: true,
      warned: 4,
      warnFailed: 1,
      suspended: 2,
      suspendFailed: 3,
    });
  });

  it("the runner's own no-op result (swept:false) still returns 200 ok:true, not an error", async () => {
    // The runner re-checks SAAS_MODE itself and returns the zero result rather than throwing;
    // the route must surface that honestly instead of dressing it up as a failure.
    runTrialLapseSweepMock.mockResolvedValueOnce({
      swept: false,
      warned: 0,
      warnFailed: 0,
      suspended: 0,
      suspendFailed: 0,
    });
    const res = await POST(makeReq({ authorization: 'Bearer cron-secret-123' }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; swept: boolean };
    expect(json.ok).toBe(true);
    expect(json.swept).toBe(false);
  });

  it('a mid-handler throw from the sweep surfaces as a clean 500 JSON, not an HTML crash page', async () => {
    runTrialLapseSweepMock.mockRejectedValueOnce(new Error('mongo timeout'));
    const res = await POST(makeReq({ authorization: 'Bearer cron-secret-123' }));
    expect(res.status).toBe(500);
    expect((await res.json()) as { error: string }).toEqual({ error: 'mongo timeout' });
  });
});
