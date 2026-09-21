import { describe, it, expect, vi, beforeEach } from 'vitest';

// POST /api/cron/alerts is the self-hosted scheduler entry point for the alert engine (P81).
// Before it existed, the fully-shipped notification framework had exactly ONE call site — the
// manual "Check & notify now" button in Settings — so an unattended instance never alerted at
// all. That makes this route the thing standing between a configured user and silence, and its
// gates are worth pinning:
//   - CRON_SECRET unset → 500 (fail CLOSED, never open-by-default), scan not run,
//   - missing / malformed / wrong / different-length bearer → 401, scan not run (the
//     constant-time compare must reject a shorter or longer token without throwing),
//   - correct bearer → runs the scan and reports { ok, sent, summary },
//   - "nothing to report" (sent:false) is a SUCCESS, not an error — a crontab log has to be
//     able to tell an all-clear apart from a failure,
//   - a throwing scan becomes a clean 500 JSON carrying the reason, not an unhandled rejection.
// Only the runAlertChecks seam are mocked; the real cronAuth runs.

const { runAlertChecksMock } = vi.hoisted(() => ({
  runAlertChecksMock: vi.fn(async () => ({ ok: true, sent: false, summary: 'All clear — nothing to report.' })),
}));

vi.mock('@/app/settings/actions', () => ({ runAlertChecks: runAlertChecksMock }));

import { POST } from './route';

function makeReq(headers: Record<string, string> = {}): Request {
  return new Request('http://pharos.local/api/cron/alerts', { method: 'POST', headers });
}

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
  process.env = { ...ORIGINAL_ENV, CRON_SECRET: 'cron-secret-123', SAAS_MODE: '' };
  runAlertChecksMock.mockResolvedValue({ ok: true, sent: false, summary: 'All clear — nothing to report.' });
});

it('CRON_SECRET unset → 500 (fail closed) and the scan never runs', async () => {
  delete process.env.CRON_SECRET;
  const res = await POST(makeReq({ authorization: 'Bearer whatever' }));

  expect(res.status).toBe(500);
  await expect(res.json()).resolves.toEqual({ error: 'CRON_SECRET is not configured' });
  expect(runAlertChecksMock).not.toHaveBeenCalled();
});

describe('bearer token gate', () => {
  it('rejects a missing authorization header', async () => {
    const res = await POST(makeReq());

    expect(res.status).toBe(401);
    expect(runAlertChecksMock).not.toHaveBeenCalled();
  });

  it('rejects a header that is not a Bearer token', async () => {
    const res = await POST(makeReq({ authorization: 'Basic cron-secret-123' }));

    expect(res.status).toBe(401);
    expect(runAlertChecksMock).not.toHaveBeenCalled();
  });

  it('rejects a wrong token of the SAME length', async () => {
    const res = await POST(makeReq({ authorization: 'Bearer cron-secret-124' }));

    expect(res.status).toBe(401);
    expect(runAlertChecksMock).not.toHaveBeenCalled();
  });

  it('rejects shorter and longer tokens without throwing (timingSafeEqual length guard)', async () => {
    const short = await POST(makeReq({ authorization: 'Bearer cron' }));
    const long = await POST(makeReq({ authorization: 'Bearer cron-secret-123-and-then-some' }));

    expect(short.status).toBe(401);
    expect(long.status).toBe(401);
    expect(runAlertChecksMock).not.toHaveBeenCalled();
  });

  it('accepts the correct token even with trailing whitespace', async () => {
    const res = await POST(makeReq({ authorization: 'Bearer cron-secret-123  ' }));

    expect(res.status).toBe(200);
    expect(runAlertChecksMock).toHaveBeenCalledTimes(1);
  });

  it('runs with dedupe on (P82) — an unattended cron must not resend the same alert every tick', async () => {
    await POST(makeReq({ authorization: 'Bearer cron-secret-123' }));

    expect(runAlertChecksMock).toHaveBeenCalledWith({ dedupe: true });
  });
});

describe('scan result', () => {
  it('reports an all-clear run as a success, not an error', async () => {
    const res = await POST(makeReq({ authorization: 'Bearer cron-secret-123' }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, sent: false, summary: 'All clear — nothing to report.' });
  });

  it('passes the dispatched summary straight through when alerts fired', async () => {
    runAlertChecksMock.mockResolvedValueOnce({ ok: true, sent: true, summary: '🎯 1 deal(s): U7 Pro' });
    const res = await POST(makeReq({ authorization: 'Bearer cron-secret-123' }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, sent: true, summary: '🎯 1 deal(s): U7 Pro' });
  });

  it('turns a throwing scan into a 500 carrying the reason, not an unhandled rejection', async () => {
    runAlertChecksMock.mockRejectedValueOnce(new Error('mongo is down'));
    const res = await POST(makeReq({ authorization: 'Bearer cron-secret-123' }));

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ ok: false, error: 'mongo is down' });
  });
});
