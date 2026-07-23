import { NextRequest, NextResponse } from 'next/server';
import { resolveWorkspaceSession } from '@/lib/tenancy/workspaceSession';
import { AuditEvent, type AuditEventDoc } from '@/models/AuditEvent';
import { Account } from '@/models/Account';
import { auditView, collectActorIds, parseAuditAction } from '@/lib/tenancy/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Bound the page size so a huge trail can't be pulled in one request. The default keeps the
// activity view snappy; a caller wanting more paginates with `?before=<iso>` (createdAt cursor).
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function parseLimit(raw: string | null): number {
  const n = raw ? Number(raw) : NaN;
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(n), MAX_LIMIT);
}

/**
 * Workspace activity trail (SaaS control plane) — the read surface for an "Activity" panel
 * in workspace settings. Lists the append-only AuditEvent rows for one workspace, newest
 * first, so an owner/admin can see who did what (members added/removed, roles changed,
 * invites minted/revoked, plan changes).
 *
 * Gating (via resolveWorkspaceSession):
 *   - SAAS_MODE off    → 404 (endpoint doesn't exist for the self-hosted app)
 *   - not signed in    → 401
 *   - not owner/admin   → 403 (viewing the audit trail is a management action)
 *
 * Only reads the control-plane AuditEvent collection; never a feature route, the per-tenant
 * data database, or the self-hosted User session. The serializer projects whitelisted
 * fields only, so no secret can leak through this surface.
 *
 * GET /api/saas/audit[?tenant=<slug>][?action=<verb>][?limit=<n>][?before=<iso>]
 *   - `action`  optional filter to one known audit verb (unknown → no filter, all actions)
 *   - `limit`   1..200, default 50
 *   - `before`  ISO timestamp cursor — return events strictly older than it (pagination)
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const slug = url.searchParams.get('tenant');
  const resolved = await resolveWorkspaceSession(slug, true);
  if ('response' in resolved) return resolved.response;
  const { session } = resolved;

  try {
    const action = parseAuditAction(url.searchParams.get('action'));
    const limit = parseLimit(url.searchParams.get('limit'));

    const query: Record<string, unknown> = { tenant: session.ctx.tenantId! };
    if (action) query.action = action;

    // Keyset pagination cursor: only apply when the timestamp is parseable, else ignore it
    // (a bad cursor shouldn't 400 a read).
    const beforeRaw = url.searchParams.get('before');
    if (beforeRaw) {
      const before = new Date(beforeRaw);
      if (!Number.isNaN(before.getTime())) {
        query.createdAt = { $lt: before };
      }
    }

    const events = (await AuditEvent.find(query)
      .select('action actor target meta createdAt')
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean()) as unknown as (AuditEventDoc & { createdAt?: Date })[];

    // Resolve every actor's email + display name in ONE batched lookup (never N+1), so the
    // Activity panel can render a human identity without its own account API. System events
    // (null actor) and deleted accounts simply have no entry → auditView gets null. A blank
    // name (Account default '') is treated as absent so the UI falls back to the email.
    const actorIds = collectActorIds(events);
    const emailById = new Map<string, string>();
    const nameById = new Map<string, string>();
    if (actorIds.length) {
      const accounts = (await Account.find({ _id: { $in: actorIds } })
        .select('email name')
        .lean()) as unknown as { _id: unknown; email?: string | null; name?: string | null }[];
      for (const a of accounts) {
        const id = String(a._id);
        if (a.email) emailById.set(id, a.email);
        const name = a.name?.trim();
        if (name) nameById.set(id, name);
      }
    }

    return NextResponse.json({
      workspace: session.workspace.slug,
      action: action ?? 'all',
      limit,
      count: events.length,
      events: events.map((ev) => {
        const id = ev.actor != null ? String(ev.actor) : null;
        return auditView(
          ev,
          id ? emailById.get(id) ?? null : null,
          id ? nameById.get(id) ?? null : null
        );
      }),
    });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message?.slice(0, 200) || 'Server error' },
      { status: 500 }
    );
  }
}
