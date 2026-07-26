import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

// GET /api/saas/audit is the workspace activity trail — the read surface behind the Activity
// panel, and the one SaaS route with keyset pagination. Zero route-level coverage before this
// file. The pure pieces run for REAL here via plain import (parseAuditAction / collectActorIds /
// auditView / redactMeta from lib/tenancy/audit, all already unit-tested in their own file), so
// the projection + redaction assertions below exercise the production serializer, not a stub.
// Mocked seams: resolveWorkspaceSession (the auth/authz gate, same idiom as invites/route.test.ts)
// and the AuditEvent + Account models. What this file covers is only the route's own job:
//   gating    - the gate short-circuit passes through untouched, before ANY query· resolves with
//               requireManage=true (reading the trail is a management action)· forwards ?tenant=.
//   scoping   - every query is scoped to the SESSION's tenant, never the requested slug.
//   ?action   - a known verb narrows the query (trimmed + case-insensitive)· an unknown verb
//               drops the filter and reports 'all' rather than 400-ing a read.
//   ?limit    - default 50· floors fractions· clamps to 200· garbage/zero/negative → default·
//               and the value the caller gets back is the one actually passed to .limit().
//   ?before   - a parseable ISO becomes a { $lt: Date } createdAt cursor· an unparseable one is
//               IGNORED (a stale/bad cursor must not 400 a read, and must not silently return an
//               unbounded page under a different filter).
//   actors    - resolved in ONE batched $in lookup (never N+1)· skipped entirely when nothing
//               references an account (no empty $in)· deleted account → null· blank name → null
//               so the UI falls back to email· system events (null actor) contribute nothing.
//   leakage   - the projection is a whitelist and secret-looking meta keys are re-redacted on the
//               way out, so a stray column on the row can never reach the client.
//   failure   - a mid-handler throw becomes the uniform { error } 500 JSON, not an HTML crash page.

const {
  resolveWorkspaceSessionMock,
  eventLean,
  eventLimit,
  eventSort,
  eventSelect,
  eventFindMock,
  accountLean,
  accountSelect,
  accountFindMock,
} = vi.hoisted(() => {
  const eventLean = vi.fn(async () => [] as Array<Record<string, unknown>>);
  const eventLimit = vi.fn(() => ({ lean: eventLean }));
  const eventSort = vi.fn(() => ({ limit: eventLimit }));
  // Param typed so `mock.calls[0][0]` is a string, not an empty tuple (tsc TS2493).
  const eventSelect = vi.fn((_projection: string) => ({ sort: eventSort }));
  const accountLean = vi.fn(async () => [] as Array<Record<string, unknown>>);
  const accountSelect = vi.fn(() => ({ lean: accountLean }));
  return {
    resolveWorkspaceSessionMock: vi.fn(),
    eventLean,
    eventLimit,
    eventSort,
    eventSelect,
    eventFindMock: vi.fn(() => ({ select: eventSelect })),
    accountLean,
    accountSelect,
    accountFindMock: vi.fn(() => ({ select: accountSelect })),
  };
});

vi.mock('@/lib/tenancy/workspaceSession', () => ({
  resolveWorkspaceSession: resolveWorkspaceSessionMock,
}));
vi.mock('@/models/AuditEvent', () => ({ AuditEvent: { find: eventFindMock } }));
vi.mock('@/models/Account', () => ({ Account: { find: accountFindMock } }));

import { GET } from './route';

const BASE = 'https://app.example.com/api/saas/audit';

function makeReq(url = BASE): NextRequest {
  return { url } as unknown as NextRequest;
}

function makeSession(role = 'owner') {
  return {
    session: {
      account: { sub: 'acc1', email: 'owner@example.com' },
      workspace: { tenantId: 'tenant1', slug: 'acme', name: 'Acme', role, plan: 'free', status: 'active' },
      ctx: { tenantId: 'tenant1', isDefault: false },
      tenant: { _id: 'tenant1', slug: 'acme', name: 'Acme' },
    },
  };
}

type Body = {
  workspace: string;
  action: string;
  limit: number;
  count: number;
  events: {
    id: string;
    action: string;
    actor: string | null;
    actorEmail: string | null;
    actorName: string | null;
    target: string | null;
    meta: Record<string, unknown> | null;
    createdAt: string | null;
  }[];
};

beforeEach(() => {
  vi.clearAllMocks();
  resolveWorkspaceSessionMock.mockResolvedValue(makeSession());
  eventLean.mockResolvedValue([]);
  accountLean.mockResolvedValue([]);
});

describe('GET /api/saas/audit — gating', () => {
  it('passes through the resolveWorkspaceSession short-circuit untouched, before any query', async () => {
    const blocked = NextResponse.json({ error: 'not authenticated' }, { status: 401 });
    resolveWorkspaceSessionMock.mockResolvedValueOnce({ response: blocked });

    const res = await GET(makeReq());

    expect(res).toBe(blocked);
    expect(eventFindMock).not.toHaveBeenCalled();
    expect(accountFindMock).not.toHaveBeenCalled();
  });

  it('resolves with requireManage=true and forwards the ?tenant= slug', async () => {
    await GET(makeReq(`${BASE}?tenant=OtherSlug`));
    expect(resolveWorkspaceSessionMock).toHaveBeenCalledWith('OtherSlug', true);
  });

  it('passes a null slug when ?tenant is absent (the session picks the workspace)', async () => {
    await GET(makeReq());
    expect(resolveWorkspaceSessionMock).toHaveBeenCalledWith(null, true);
  });

  it('scopes the query to the SESSION tenant, never the requested slug', async () => {
    // A caller may name any slug; the gate resolves it, and only the resolved tenant id is
    // ever queried. This is the isolation invariant of the whole surface.
    await GET(makeReq(`${BASE}?tenant=someone-elses-workspace`));
    expect(eventFindMock).toHaveBeenCalledWith({ tenant: 'tenant1' });
  });
});

describe('GET /api/saas/audit — listing shape', () => {
  it('lists newest-first with the default page size and echoes the workspace', async () => {
    const res = await GET(makeReq());
    const json = (await res.json()) as Body;

    expect(eventFindMock).toHaveBeenCalledWith({ tenant: 'tenant1' });
    expect(eventSort).toHaveBeenCalledWith({ createdAt: -1 });
    expect(eventLimit).toHaveBeenCalledWith(50);
    expect(json.workspace).toBe('acme');
    expect(json.action).toBe('all');
    expect(json.limit).toBe(50);
    expect(json.count).toBe(0);
    expect(json.events).toEqual([]);
  });

  it('count reflects the rows actually returned', async () => {
    eventLean.mockResolvedValueOnce([
      { _id: 'e1', action: 'member.added', actor: null, createdAt: new Date('2026-07-01T10:00:00Z') },
      { _id: 'e2', action: 'invite.sent', actor: null, createdAt: new Date('2026-07-02T10:00:00Z') },
    ]);

    const json = (await (await GET(makeReq())).json()) as Body;

    expect(json.count).toBe(2);
    expect(json.events.map((e) => e.id)).toEqual(['e1', 'e2']);
  });

  it('serializes an event through auditView (id/action/target/meta/createdAt as ISO)', async () => {
    eventLean.mockResolvedValueOnce([
      {
        _id: 'e1',
        action: 'member.role_changed',
        actor: null,
        target: 'someone@example.com',
        meta: { from: 'member', to: 'admin' },
        createdAt: new Date('2026-07-04T12:34:56.000Z'),
      },
    ]);

    const json = (await (await GET(makeReq())).json()) as Body;

    expect(json.events[0]).toMatchObject({
      id: 'e1',
      action: 'member.role_changed',
      actor: null,
      target: 'someone@example.com',
      meta: { from: 'member', to: 'admin' },
      createdAt: '2026-07-04T12:34:56.000Z',
    });
  });
});

describe('GET /api/saas/audit — ?action filter', () => {
  it('a known verb narrows the query and is echoed back', async () => {
    const json = (await (await GET(makeReq(`${BASE}?action=member.removed`))).json()) as Body;

    expect(eventFindMock).toHaveBeenCalledWith({ tenant: 'tenant1', action: 'member.removed' });
    expect(json.action).toBe('member.removed');
  });

  it('trims and lowercases the verb before matching', async () => {
    const json = (await (await GET(makeReq(`${BASE}?action=%20%20INVITE.SENT%20`))).json()) as Body;

    expect(eventFindMock).toHaveBeenCalledWith({ tenant: 'tenant1', action: 'invite.sent' });
    expect(json.action).toBe('invite.sent');
  });

  it('an unknown verb drops the filter (reports "all") instead of 400-ing the read', async () => {
    const res = await GET(makeReq(`${BASE}?action=member.teleported`));
    const json = (await res.json()) as Body;

    expect(res.status).toBe(200);
    expect(eventFindMock).toHaveBeenCalledWith({ tenant: 'tenant1' });
    expect(json.action).toBe('all');
  });

  it('an empty ?action is treated as no filter', async () => {
    const json = (await (await GET(makeReq(`${BASE}?action=`))).json()) as Body;

    expect(eventFindMock).toHaveBeenCalledWith({ tenant: 'tenant1' });
    expect(json.action).toBe('all');
  });
});

describe('GET /api/saas/audit — ?limit bounds', () => {
  it('honours an explicit in-range limit and reports the same number it applied', async () => {
    const json = (await (await GET(makeReq(`${BASE}?limit=10`))).json()) as Body;

    expect(eventLimit).toHaveBeenCalledWith(10);
    expect(json.limit).toBe(10);
  });

  it('clamps an oversized limit to the 200 ceiling (a huge trail cannot be pulled at once)', async () => {
    const json = (await (await GET(makeReq(`${BASE}?limit=100000`))).json()) as Body;

    expect(eventLimit).toHaveBeenCalledWith(200);
    expect(json.limit).toBe(200);
  });

  it('accepts the ceiling exactly', async () => {
    await GET(makeReq(`${BASE}?limit=200`));
    expect(eventLimit).toHaveBeenCalledWith(200);
  });

  it('floors a fractional limit (never a non-integer .limit())', async () => {
    await GET(makeReq(`${BASE}?limit=10.7`));
    expect(eventLimit).toHaveBeenCalledWith(10);
  });

  it.each([
    ['garbage', 'abc'],
    ['zero', '0'],
    ['negative', '-5'],
    ['empty', ''],
    ['Infinity', 'Infinity'],
  ])('falls back to the default page size for a %s limit', async (_label, raw) => {
    const json = (await (await GET(makeReq(`${BASE}?limit=${raw}`))).json()) as Body;

    expect(eventLimit).toHaveBeenCalledWith(50);
    expect(json.limit).toBe(50);
  });
});

describe('GET /api/saas/audit — ?before keyset cursor', () => {
  it('turns a parseable ISO timestamp into a { $lt: Date } createdAt cursor', async () => {
    await GET(makeReq(`${BASE}?before=2026-07-01T00%3A00%3A00.000Z`));

    expect(eventFindMock).toHaveBeenCalledWith({
      tenant: 'tenant1',
      createdAt: { $lt: new Date('2026-07-01T00:00:00.000Z') },
    });
  });

  it('IGNORES an unparseable cursor rather than 400-ing the read', async () => {
    // A stale/mangled cursor from an old client must degrade to "first page", not an error.
    const res = await GET(makeReq(`${BASE}?before=not-a-date`));

    expect(res.status).toBe(200);
    expect(eventFindMock).toHaveBeenCalledWith({ tenant: 'tenant1' });
  });

  it('ignores an empty ?before', async () => {
    await GET(makeReq(`${BASE}?before=`));
    expect(eventFindMock).toHaveBeenCalledWith({ tenant: 'tenant1' });
  });

  it('combines the cursor with an action filter in ONE query (page 2 of a filtered trail)', async () => {
    await GET(makeReq(`${BASE}?action=plan.changed&before=2026-06-15T08%3A00%3A00.000Z&limit=25`));

    expect(eventFindMock).toHaveBeenCalledTimes(1);
    expect(eventFindMock).toHaveBeenCalledWith({
      tenant: 'tenant1',
      action: 'plan.changed',
      createdAt: { $lt: new Date('2026-06-15T08:00:00.000Z') },
    });
    expect(eventLimit).toHaveBeenCalledWith(25);
  });
});

describe('GET /api/saas/audit — actor identity resolution', () => {
  it('skips the Account lookup entirely when there are no events (no empty $in)', async () => {
    await GET(makeReq());
    expect(accountFindMock).not.toHaveBeenCalled();
  });

  it('skips the Account lookup when every event is system-originated (null actor)', async () => {
    eventLean.mockResolvedValueOnce([
      { _id: 'e1', action: 'workspace.suspended', actor: null, createdAt: new Date() },
      { _id: 'e2', action: 'plan.changed', actor: null, createdAt: new Date() },
    ]);

    const json = (await (await GET(makeReq())).json()) as Body;

    expect(accountFindMock).not.toHaveBeenCalled();
    expect(json.events[0].actor).toBeNull();
    expect(json.events[0].actorEmail).toBeNull();
    expect(json.events[0].actorName).toBeNull();
  });

  it('resolves every distinct actor in ONE batched $in lookup (never N+1)', async () => {
    eventLean.mockResolvedValueOnce([
      { _id: 'e1', action: 'member.added', actor: 'accA', createdAt: new Date() },
      { _id: 'e2', action: 'invite.sent', actor: 'accA', createdAt: new Date() },
      { _id: 'e3', action: 'invite.revoked', actor: 'accB', createdAt: new Date() },
      { _id: 'e4', action: 'workspace.updated', actor: null, createdAt: new Date() },
    ]);
    accountLean.mockResolvedValueOnce([
      { _id: 'accA', email: 'a@example.com', name: 'Alice Admin' },
      { _id: 'accB', email: 'b@example.com', name: 'Bob Owner' },
    ]);

    const json = (await (await GET(makeReq())).json()) as Body;

    // One query, distinct ids only, and the null actor contributes nothing to the $in.
    expect(accountFindMock).toHaveBeenCalledTimes(1);
    expect(accountFindMock).toHaveBeenCalledWith({ _id: { $in: ['accA', 'accB'] } });
    expect(accountSelect).toHaveBeenCalledWith('email name');
    expect(json.events[0].actorEmail).toBe('a@example.com');
    expect(json.events[0].actorName).toBe('Alice Admin');
    expect(json.events[1].actorEmail).toBe('a@example.com');
    expect(json.events[2].actorName).toBe('Bob Owner');
    expect(json.events[3].actorEmail).toBeNull();
  });

  it('a deleted account resolves to nulls instead of crashing the page', async () => {
    eventLean.mockResolvedValueOnce([
      { _id: 'e1', action: 'member.removed', actor: 'ghost', createdAt: new Date() },
    ]);
    accountLean.mockResolvedValueOnce([]); // account row gone

    const json = (await (await GET(makeReq())).json()) as Body;

    expect(json.events[0].actor).toBe('ghost');
    expect(json.events[0].actorEmail).toBeNull();
    expect(json.events[0].actorName).toBeNull();
  });

  it('a blank display name resolves to null so the UI falls back to the email', async () => {
    eventLean.mockResolvedValueOnce([
      { _id: 'e1', action: 'member.added', actor: 'accA', createdAt: new Date() },
    ]);
    accountLean.mockResolvedValueOnce([{ _id: 'accA', email: 'a@example.com', name: '   ' }]);

    const json = (await (await GET(makeReq())).json()) as Body;

    expect(json.events[0].actorEmail).toBe('a@example.com');
    expect(json.events[0].actorName).toBeNull();
  });

  it('an account row with no email yields a null email but keeps the resolved name', async () => {
    eventLean.mockResolvedValueOnce([
      { _id: 'e1', action: 'member.added', actor: 'accA', createdAt: new Date() },
    ]);
    accountLean.mockResolvedValueOnce([{ _id: 'accA', email: null, name: 'Nameless Email' }]);

    const json = (await (await GET(makeReq())).json()) as Body;

    expect(json.events[0].actorEmail).toBeNull();
    expect(json.events[0].actorName).toBe('Nameless Email');
  });

  it('stringifies ObjectId-like actor ids on both sides so they still match', async () => {
    const objectIdish = { toString: () => 'accA' };
    eventLean.mockResolvedValueOnce([
      { _id: 'e1', action: 'member.added', actor: objectIdish, createdAt: new Date() },
    ]);
    accountLean.mockResolvedValueOnce([{ _id: objectIdish, email: 'a@example.com', name: 'Alice' }]);

    const json = (await (await GET(makeReq())).json()) as Body;

    expect(accountFindMock).toHaveBeenCalledWith({ _id: { $in: ['accA'] } });
    expect(json.events[0].actor).toBe('accA');
    expect(json.events[0].actorEmail).toBe('a@example.com');
  });
});

describe('GET /api/saas/audit — leakage guards', () => {
  it('projects a whitelist only, so a stray column on the row never reaches the client', async () => {
    eventLean.mockResolvedValueOnce([
      {
        _id: 'e1',
        action: 'invite.sent',
        actor: null,
        tokenHash: 'super-secret-hash',
        tenant: 'tenant1',
        createdAt: new Date(),
      },
    ]);

    const res = await GET(makeReq());
    const body = JSON.stringify(await res.json());

    const projection = eventSelect.mock.calls[0][0];
    expect(projection).toBe('action actor target meta createdAt');
    expect(projection).not.toContain('tokenHash');
    expect(body).not.toContain('super-secret-hash');
  });

  it('re-redacts secret-looking meta keys on the way out (defence in depth for legacy rows)', async () => {
    eventLean.mockResolvedValueOnce([
      {
        _id: 'e1',
        action: 'invite.sent',
        actor: null,
        meta: { email: 'a@example.com', resetToken: 'leaky', passwordHash: 'leaky2' },
        createdAt: new Date(),
      },
    ]);

    const res = await GET(makeReq());
    const json = (await res.json()) as Body;
    const body = JSON.stringify(json);

    expect(json.events[0].meta).toEqual({ email: 'a@example.com' });
    expect(body).not.toContain('leaky');
  });
});

describe('GET /api/saas/audit — failure shape', () => {
  it('a mid-handler throw becomes the uniform { error } 500 JSON, not an HTML crash page', async () => {
    eventLean.mockRejectedValueOnce(new Error('replica set stepped down'));

    const res = await GET(makeReq());
    const json = (await res.json()) as { error: string };

    expect(res.status).toBe(500);
    expect(json.error).toBe('replica set stepped down');
  });

  it('an Account-lookup throw is caught too (not just the event query)', async () => {
    eventLean.mockResolvedValueOnce([
      { _id: 'e1', action: 'member.added', actor: 'accA', createdAt: new Date() },
    ]);
    accountLean.mockRejectedValueOnce(new Error('actor lookup failed'));

    const res = await GET(makeReq());

    expect(res.status).toBe(500);
    expect(((await res.json()) as { error: string }).error).toBe('actor lookup failed');
  });

  it('a message-less throw still returns a generic error string', async () => {
    eventLean.mockRejectedValueOnce(new Error(''));

    const res = await GET(makeReq());

    expect(res.status).toBe(500);
    expect(((await res.json()) as { error: string }).error).toBe('Server error');
  });

  it('truncates a huge error message so an internal dump cannot ride out in the body', async () => {
    eventLean.mockRejectedValueOnce(new Error('x'.repeat(5000)));

    const res = await GET(makeReq());
    const json = (await res.json()) as { error: string };

    expect(json.error).toHaveLength(200);
  });
});
