import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Route-level contract for the fail2ban unban queue. The pure validation lives in
// lib/saas/f2b.test.ts; what is proved HERE is the ordering that makes the feature safe:
// the operator gate runs before anything is parsed, the rate limit runs before anything is
// written, a rejected address never reaches the queue, and the audit row is only written when
// the request actually landed on disk.

const { requireSuperadminMock, rateLimitMock, requestUnbanMock, recordAuditMock } = vi.hoisted(
  () => ({
    requireSuperadminMock: vi.fn(),
    rateLimitMock: vi.fn<(key: string) => NextResponse | null>(() => null),
    requestUnbanMock: vi.fn(),
    recordAuditMock: vi.fn(),
  })
);

vi.mock('@/lib/tenancy/superadmin', () => ({ requireSuperadmin: requireSuperadminMock }));
vi.mock('@/lib/apiAuth', () => ({
  rateLimit: (k: string) => rateLimitMock(k),
  clientIp: () => '203.0.113.9',
}));
vi.mock('@/lib/tenancy/audit', () => ({
  recordAudit: recordAuditMock,
  auditCtx: () => ({ tenant: null }),
}));
// The f2b helper's real validators are used on purpose (they are the thing the route relies on);
// only the disk write is replaced.
vi.mock('@/lib/saas/f2b', async () => {
  const actual = await vi.importActual<typeof import('@/lib/saas/f2b')>('@/lib/saas/f2b');
  return { ...actual, requestUnban: requestUnbanMock };
});

import { POST } from './route';

function makeReq(body: unknown): NextRequest {
  return {
    url: 'https://app.ph-aros.com/api/saas/admin/firewall/unban',
    headers: new Headers(),
    json: async () => body,
  } as unknown as NextRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
  requireSuperadminMock.mockResolvedValue({ account: { sub: 'op1', email: 'ops@pharos.dev' } });
  rateLimitMock.mockReturnValue(null);
  requestUnbanMock.mockResolvedValue({ ok: true, file: 'req.req' });
});

describe('POST /api/saas/admin/firewall/unban', () => {
  it('queues a valid request and answers 202, never 200', async () => {
    const res = await POST(makeReq({ ip: '1.2.3.4' }));

    // 202 because the host acts within a minute; this side has not unbanned anything yet.
    expect(res.status).toBe(202);
    await expect(res.json()).resolves.toMatchObject({ ok: true, queued: true, ip: '1.2.3.4', jail: 'sshd' });
    expect(requestUnbanMock).toHaveBeenCalledWith('1.2.3.4', 'sshd');
  });

  it('passes the superadmin short-circuit through untouched and never queues or rate-limits', async () => {
    const blocked = NextResponse.json({ error: 'forbidden' }, { status: 403 });
    requireSuperadminMock.mockResolvedValueOnce({ response: blocked });

    const res = await POST(makeReq({ ip: '1.2.3.4' }));

    expect(res).toBe(blocked);
    expect(rateLimitMock).not.toHaveBeenCalled();
    expect(requestUnbanMock).not.toHaveBeenCalled();
    expect(recordAuditMock).not.toHaveBeenCalled();
  });

  it('honours the rate limit before touching the queue', async () => {
    const limited = NextResponse.json({ error: 'slow down' }, { status: 429 });
    rateLimitMock.mockReturnValueOnce(limited);

    const res = await POST(makeReq({ ip: '1.2.3.4' }));

    expect(res).toBe(limited);
    expect(requestUnbanMock).not.toHaveBeenCalled();
    expect(recordAuditMock).not.toHaveBeenCalled();
    expect(rateLimitMock.mock.calls[0][0]).toContain('203.0.113.9');
  });

  it('rejects anything that is not a bare address, without queueing it', async () => {
    for (const ip of ['1.2.3.4; rm -rf /', 'localhost', '1.2.3.4/24', '', '1.2.3.4 5.6.7.8']) {
      const res = await POST(makeReq({ ip }));
      expect(res.status, ip).toBe(400);
    }
    expect(requestUnbanMock).not.toHaveBeenCalled();
    expect(recordAuditMock).not.toHaveBeenCalled();
  });

  it('rejects a jail that is not on the allowlist', async () => {
    const res = await POST(makeReq({ ip: '1.2.3.4', jail: 'nginx' }));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: 'unknown jail' });
    expect(requestUnbanMock).not.toHaveBeenCalled();
  });

  it('reports a missing queue directory as 503, not as a bad address', async () => {
    requestUnbanMock.mockResolvedValueOnce({
      ok: false,
      reason: 'write-failed',
      detail: 'no /var/lib/pharos/f2b/requests — the f2b bridge directory is not mounted',
    });

    const res = await POST(makeReq({ ip: '1.2.3.4' }));

    // The operator's input was fine; the deployment is not. Rendering this as 400 would send
    // someone hunting a typo in an address that was correct.
    expect(res.status).toBe(503);
    expect(recordAuditMock).not.toHaveBeenCalled();
  });

  it('writes the audit row only after the request is on disk, with who and what', async () => {
    await POST(makeReq({ ip: '5.6.7.8' }));

    expect(recordAuditMock).toHaveBeenCalledTimes(1);
    expect(recordAuditMock.mock.calls[0][1]).toMatchObject({
      action: 'platform.firewall_unban_requested',
      actor: 'ops@pharos.dev',
      meta: { ip: '5.6.7.8', jail: 'sshd' },
    });
  });

  it('turns an unexpected throw into a clean JSON 500 via saasGuard', async () => {
    requestUnbanMock.mockRejectedValueOnce(new Error('disk on fire'));

    const res = await POST(makeReq({ ip: '1.2.3.4' }));

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({ error: 'disk on fire' });
  });
});
