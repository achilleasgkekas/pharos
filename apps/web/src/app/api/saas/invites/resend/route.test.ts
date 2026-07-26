import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

// POST /api/saas/invites/resend re-mints a FRESH token on a still-pending invite and re-sends
// the signup link in one call — the "the link went stale before they clicked it" button of the
// Invitations panel. Zero route-level coverage before this file. The pure pieces run for REAL
// here via plain import (mintInviteToken/hashInviteToken from lib/tenancy/invites, readBody/
// isObjectId from lib/apiBody, pickBaseUrl from lib/billing/billingRoutes, inviteEmail/
// inviteLinkUrl — pure message builders — from lib/tenancy/mailer), all already unit-tested in
// their own files. Mocked seams: resolveWorkspaceSession, the Invite model, sendEmail +
// mailerCanDeliver (the only side-effecting mailer bits), recordAudit (auditCtx stays real).
// Covered here, and only what the route itself owns:
//   - the gate short-circuit passes through untouched, before any mint/write/audit/mail,
//   - resolves with requireManage=true and forwards the trimmed ?tenant body field (blank → null),
//   - missing / malformed inviteId → 400 before Mongoose (CastError guard), zero write,
//   - the re-mint is scoped to {_id, tenant, status:'pending'} so one workspace cannot resend
//     another's invite and an accepted/revoked row is untouched (→ 404, zero audit, zero mail),
//   - only the HASH is persisted — never the plaintext token — and the hash actually matches the
//     token the caller is handed back (the property that makes the new link redeemable),
//   - a successful resend audits invite.resent with the email as target and the role as meta,
//   - mailer wired → sends to the invitee with the token-bearing link and does NOT echo devToken;
//     unwired + non-production → echoes devToken (local-testability scaffold); unwired +
//     production → drops it silently, no leak,
//   - SAAS_PUBLIC_URL wins over the request origin when building the link,
//   - a mid-handler throw becomes a clean 500 JSON (saasGuard), not an HTML crash page.

const {
  resolveWorkspaceSessionMock,
  inviteUpdateLean,
  inviteUpdateSelect,
  inviteFindOneAndUpdateMock,
  sendEmailMock,
  mailerCanDeliverMock,
  recordAuditMock,
} = vi.hoisted(() => {
  const inviteUpdateLean = vi.fn(async () => null as Record<string, unknown> | null);
  const inviteUpdateSelect = vi.fn(() => ({ lean: inviteUpdateLean }));
  return {
    resolveWorkspaceSessionMock: vi.fn(),
    inviteUpdateLean,
    inviteUpdateSelect,
    inviteFindOneAndUpdateMock: vi.fn(() => ({ select: inviteUpdateSelect })),
    // Typed param so `mock.calls[0][0]` is the message, not an empty tuple.
    sendEmailMock: vi.fn(async (_msg: { to: string; subject: string; html: string }) => ({
      delivered: true,
      provider: 'smtp' as const,
    })),
    mailerCanDeliverMock: vi.fn(() => false),
    recordAuditMock: vi.fn(async () => true),
  };
});

vi.mock('@/lib/tenancy/workspaceSession', () => ({ resolveWorkspaceSession: resolveWorkspaceSessionMock }));
vi.mock('@/models/Invite', () => ({ Invite: { findOneAndUpdate: inviteFindOneAndUpdateMock } }));
vi.mock('@/lib/tenancy/mailer', async () => {
  const actual = await vi.importActual<typeof import('@/lib/tenancy/mailer')>('@/lib/tenancy/mailer');
  // inviteEmail/inviteLinkUrl stay real — they are pure builders with their own tests.
  return { ...actual, sendEmail: sendEmailMock, mailerCanDeliver: mailerCanDeliverMock };
});
vi.mock('@/lib/tenancy/audit', async () => {
  const actual = await vi.importActual<typeof import('@/lib/tenancy/audit')>('@/lib/tenancy/audit');
  return { ...actual, recordAudit: recordAuditMock }; // auditCtx/etc stay real (pure)
});

import { POST } from './route';
import { hashInviteToken } from '@/lib/tenancy/invites';

const VALID_ID = 'b'.repeat(24);

function makeReq(
  body: unknown = {},
  url = 'https://app.example.com/api/saas/invites/resend'
): NextRequest {
  return { json: async () => body, url } as unknown as NextRequest;
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

const PENDING = { email: 'invitee@example.com', role: 'admin', expires: new Date('2026-08-01T00:00:00Z') };

/** The `$set` payload the route handed Mongoose on the (single) re-mint call. */
function setPayload(): { tokenHash: string; expires: Date } {
  const call = inviteFindOneAndUpdateMock.mock.calls[0] as unknown as [
    unknown,
    { $set: { tokenHash: string; expires: Date } },
    unknown,
  ];
  return call[1].$set;
}

beforeEach(() => {
  vi.clearAllMocks();
  resolveWorkspaceSessionMock.mockResolvedValue(makeSession());
  inviteUpdateLean.mockResolvedValue(PENDING);
  mailerCanDeliverMock.mockReturnValue(false);
  sendEmailMock.mockResolvedValue({ delivered: true, provider: 'smtp' });
  recordAuditMock.mockResolvedValue(true);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('POST /api/saas/invites/resend — gating and input guards', () => {
  it('passes through resolveWorkspaceSession short-circuit untouched, before any mint or write', async () => {
    const blocked = NextResponse.json({ error: 'forbidden' }, { status: 403 });
    resolveWorkspaceSessionMock.mockResolvedValueOnce({ response: blocked });

    const res = await POST(makeReq({ inviteId: VALID_ID }));

    expect(res).toBe(blocked);
    expect(inviteFindOneAndUpdateMock).not.toHaveBeenCalled();
    expect(recordAuditMock).not.toHaveBeenCalled();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('resolves with requireManage=true and forwards the trimmed tenant body field', async () => {
    await POST(makeReq({ inviteId: VALID_ID, tenant: '  OtherSlug  ' }));
    expect(resolveWorkspaceSessionMock).toHaveBeenCalledWith('OtherSlug', true);
  });

  it('blank tenant field resolves as null', async () => {
    await POST(makeReq({ inviteId: VALID_ID, tenant: '   ' }));
    expect(resolveWorkspaceSessionMock).toHaveBeenCalledWith(null, true);
  });

  it('missing inviteId → 400, zero write', async () => {
    const res = await POST(makeReq({}));
    const json = (await res.json()) as { error: string };

    expect(res.status).toBe(400);
    expect(json.error).toMatch(/inviteId is required/i);
    expect(inviteFindOneAndUpdateMock).not.toHaveBeenCalled();
  });

  it('malformed inviteId → 400 before Mongoose (CastError guard), zero write', async () => {
    const res = await POST(makeReq({ inviteId: 'nope' }));
    const json = (await res.json()) as { error: string };

    expect(res.status).toBe(400);
    expect(json.error).toMatch(/invalid inviteId/i);
    expect(inviteFindOneAndUpdateMock).not.toHaveBeenCalled();
  });

  it('no pending invite with that id in this workspace → 404, zero audit, zero mail', async () => {
    inviteUpdateLean.mockResolvedValueOnce(null);
    mailerCanDeliverMock.mockReturnValue(true);

    const res = await POST(makeReq({ inviteId: VALID_ID }));
    const json = (await res.json()) as { error: string };

    expect(res.status).toBe(404);
    expect(json.error).toMatch(/no pending invite/i);
    expect(recordAuditMock).not.toHaveBeenCalled();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/saas/invites/resend — re-mint', () => {
  it('scopes the re-mint to {_id, tenant, pending} and asks for the updated row', async () => {
    await POST(makeReq({ inviteId: VALID_ID }));

    const call = inviteFindOneAndUpdateMock.mock.calls[0] as unknown as [
      Record<string, unknown>,
      unknown,
      Record<string, unknown>,
    ];
    expect(call[0]).toEqual({ _id: VALID_ID, tenant: 'tenant1', status: 'pending' });
    expect(call[2]).toEqual({ new: true });
  });

  it('persists only the HASH, and that hash matches the token handed back', async () => {
    const res = await POST(makeReq({ inviteId: VALID_ID }));
    const json = (await res.json()) as { devToken: string };
    const { tokenHash } = setPayload();

    expect(json.devToken).toBeTruthy();
    expect(tokenHash).toBe(hashInviteToken(json.devToken));
    expect(tokenHash).not.toBe(json.devToken);
    expect(JSON.stringify(inviteFindOneAndUpdateMock.mock.calls[0])).not.toContain(json.devToken);
  });

  it('pushes the expiry into the future (the point of resending a stale link)', async () => {
    await POST(makeReq({ inviteId: VALID_ID }));
    const { expires } = setPayload();

    expect(expires.getTime()).toBeGreaterThan(Date.now());
  });

  it('two resends mint two different tokens (the previous link is retired)', async () => {
    const first = (await (await POST(makeReq({ inviteId: VALID_ID }))).json()) as { devToken: string };
    const firstHash = setPayload().tokenHash;
    inviteFindOneAndUpdateMock.mockClear();
    const second = (await (await POST(makeReq({ inviteId: VALID_ID }))).json()) as { devToken: string };

    expect(second.devToken).not.toBe(first.devToken);
    expect(setPayload().tokenHash).not.toBe(firstHash);
  });

  it('success → audits invite.resent and returns the invite view', async () => {
    const res = await POST(makeReq({ inviteId: VALID_ID }));
    const json = (await res.json()) as {
      resent: string;
      invite: { email: string; role: string; status: string };
    };

    expect(recordAuditMock).toHaveBeenCalledWith(
      { tenantId: 'tenant1', isDefault: false },
      {
        action: 'invite.resent',
        actor: 'acc1',
        target: 'invitee@example.com',
        meta: { role: 'admin' },
      }
    );
    expect(json.resent).toBe(VALID_ID);
    expect(json.invite).toMatchObject({ email: 'invitee@example.com', role: 'admin', status: 'pending' });
  });

  it('mid-handler throw → clean 500 JSON (saasGuard)', async () => {
    inviteUpdateLean.mockRejectedValueOnce(new Error('mongo down'));

    const res = await POST(makeReq({ inviteId: VALID_ID }));
    const json = (await res.json()) as { error: string };

    expect(res.status).toBe(500);
    expect(json.error).toBe('mongo down');
  });
});

describe('POST /api/saas/invites/resend — delivery', () => {
  it('mailer wired → mails the invitee a link carrying the fresh token, no devToken echoed', async () => {
    mailerCanDeliverMock.mockReturnValue(true);

    const res = await POST(makeReq({ inviteId: VALID_ID }));
    const json = (await res.json()) as { devToken?: string };
    const msg = sendEmailMock.mock.calls[0][0];
    const { tokenHash } = setPayload();

    expect(msg.to).toBe('invitee@example.com');
    expect(msg.subject).toContain('acme');
    const token = /invite=([^"&]+)/.exec(msg.html)?.[1] ?? '';
    expect(hashInviteToken(decodeURIComponent(token))).toBe(tokenHash);
    expect(json.devToken).toBeUndefined();
  });

  it('SAAS_PUBLIC_URL wins over the request origin when building the link', async () => {
    mailerCanDeliverMock.mockReturnValue(true);
    vi.stubEnv('SAAS_PUBLIC_URL', 'https://pharos.example.io');

    await POST(makeReq({ inviteId: VALID_ID }, 'https://internal.local/api/saas/invites/resend'));
    const msg = sendEmailMock.mock.calls[0][0];

    expect(msg.html).toContain('https://pharos.example.io/signup?invite=');
    expect(msg.html).not.toContain('internal.local');
  });

  it('falls back to the request origin when no public URL is configured', async () => {
    mailerCanDeliverMock.mockReturnValue(true);
    vi.stubEnv('SAAS_PUBLIC_URL', '');
    vi.stubEnv('APP_URL', '');

    await POST(makeReq({ inviteId: VALID_ID }, 'https://app.example.com/api/saas/invites/resend'));
    const msg = sendEmailMock.mock.calls[0][0];

    expect(msg.html).toContain('https://app.example.com/signup?invite=');
  });

  it('no mailer + non-production → echoes devToken so the flow stays locally testable', async () => {
    mailerCanDeliverMock.mockReturnValue(false);
    vi.stubEnv('NODE_ENV', 'development');

    const res = await POST(makeReq({ inviteId: VALID_ID }));
    const json = (await res.json()) as { devToken?: string };

    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(json.devToken).toBeTruthy();
  });

  it('no mailer + production → drops the token silently (no leak in the response)', async () => {
    mailerCanDeliverMock.mockReturnValue(false);
    vi.stubEnv('NODE_ENV', 'production');

    const res = await POST(makeReq({ inviteId: VALID_ID }));
    const json = (await res.json()) as { devToken?: string; resent: string };

    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(json.devToken).toBeUndefined();
    expect(json.resent).toBe(VALID_ID); // still a successful resend, just undeliverable
  });
});
