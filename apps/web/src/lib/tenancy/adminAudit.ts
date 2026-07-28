// Superadmin PLATFORM-WIDE audit feed (TODO §8 "Superadmin console") — READ-ONLY, cross-tenant.
//
// The audit trail is already readable in two places, both scoped to ONE workspace: the tenant's
// own Activity tab ((saas)/account/workspace/activity, via api/saas/audit) and the operator's
// per-tenant view (/admin/tenants/[slug]). Neither answers the question an operator actually
// asks during an incident — "what happened across the whole platform in the last hour" — because
// both require you to already know which workspace to look at. This module is that missing read:
// every AuditEvent row, newest first, regardless of tenant, with each row attributed back to its
// workspace.
//
// Split as elsewhere in tenancy/: everything except `listPlatformAudit` is pure (no DB, no next/*)
// so the query parsing, filter shape, and id collection are unit-testable without Mongo.
//
// READ-ONLY: touches only the central registry (AuditEvent + a batched Account/Tenant lookup for
// display identity). Never opens a per-tenant data database, never writes. Only meaningful when
// SAAS_MODE is on.
//
// NOTE on the import direction: the keyset-pagination helpers live in components/saas/activityCursor
// because the two existing Activity pages needed them first. They are a pure leaf module (no React,
// no next/*, no imports from lib/), so reusing them here keeps ONE definition of the cursor shape.
// Re-deriving the `$or` keyset filter locally would be a second, silently-divergable copy of
// correctness-sensitive pagination logic.
import { connectDB } from '@/lib/db';
import { AuditEvent, type AuditEventDoc } from '@/models/AuditEvent';
import { Account } from '@/models/Account';
import { Tenant } from '@/models/Tenant';
import {
  auditView,
  collectActorIds,
  parseAuditAction,
  type AuditAction,
  type AuditView,
} from './audit';
import {
  cursorFilter,
  decodeActivityCursor,
  splitPage,
  type ActivityCursor,
} from '@/components/saas/activityCursor';

// Bound the page size: the audit collection is append-only and grows without limit, so a
// cross-tenant read must never be able to pull it all in one request.
export const MAX_PLATFORM_AUDIT_PAGE = 200;
export const DEFAULT_PLATFORM_AUDIT_PAGE = 50;

export type AdminAuditQuery = {
  limit: number;
  /** Optional filter to one known audit verb; null = all actions. */
  action: AuditAction | null;
  /** Optional workspace slug filter; null = every tenant. Normalized lowercase/trimmed. */
  tenant: string | null;
  /** Keyset resume point for "Load more"; null = newest page. */
  cursor: ActivityCursor | null;
};

/**
 * Clamp/validate raw query-string params into a well-formed `AdminAuditQuery`.
 *   - limit:  1..MAX_PLATFORM_AUDIT_PAGE, default DEFAULT_PLATFORM_AUDIT_PAGE (non-numeric/≤0 →
 *             default), so a hand-edited `?limit=` can neither DoS the read nor return nothing.
 *   - action: only a known audit verb survives, else null (no filter) — same leniency as
 *             parseAuditAction, because a stray query param should show everything, not 400.
 *   - tenant: trimmed + lowercased slug (the Tenant.slug field is stored lowercase), blank → null.
 *   - cursor: decoded via the shared helper; malformed/tampered → null (= first page).
 * PURE.
 */
export function parseAdminAuditQuery(params: URLSearchParams): AdminAuditQuery {
  const rawLimit = Number(params.get('limit'));
  const limit =
    Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.min(MAX_PLATFORM_AUDIT_PAGE, Math.floor(rawLimit))
      : DEFAULT_PLATFORM_AUDIT_PAGE;

  const tenant = (params.get('tenant') || '').trim().toLowerCase() || null;

  return {
    limit,
    action: parseAuditAction(params.get('action')),
    tenant,
    cursor: decodeActivityCursor(params.get('before')),
  };
}

/**
 * Build the mongoose filter for one page of the platform feed. Deliberately has NO tenant clause
 * unless one is passed: this is the cross-tenant read, and an accidental default scope would
 * silently show an empty/partial feed. Pairs with a `{ createdAt: -1, _id: -1 }` sort.
 * PURE: returns a plain filter object, no DB access.
 */
export function buildPlatformAuditFilter(input: {
  tenantId?: string | null;
  action?: AuditAction | null;
  cursor?: ActivityCursor | null;
}): Record<string, unknown> {
  const filter: Record<string, unknown> = {};
  if (input.tenantId) filter.tenant = input.tenantId;
  if (input.action) filter.action = input.action;
  if (input.cursor) Object.assign(filter, cursorFilter(input.cursor));
  return filter;
}

/**
 * Distinct, stringified, non-null tenant ids across a batch of events — the cross-tenant mirror of
 * audit.collectActorIds, so the feed resolves every workspace identity in ONE `_id: { $in }` query
 * instead of N+1 lookups. PURE.
 */
export function collectTenantIds(events: readonly { tenant?: unknown }[]): string[] {
  const seen = new Set<string>();
  for (const ev of events) {
    if (ev.tenant != null) seen.add(String(ev.tenant));
  }
  return [...seen];
}

/** One platform-feed row: the workspace-scoped audit projection plus its workspace attribution. */
export type PlatformAuditEvent = AuditView & {
  /** Slug of the workspace the event belongs to; null when the tenant row is gone (deleted). */
  workspaceSlug: string | null;
  /** Display name of that workspace; null when unresolvable or never set. */
  workspaceName: string | null;
};

/**
 * Project one AuditEvent row to a platform-feed row. Delegates the whitelisting/redaction to
 * `auditView` (so this surface can never expose a field the workspace-scoped one wouldn't) and
 * only adds the workspace attribution. Unresolvable tenant → both fields null rather than a
 * fabricated label, so the UI can say "deleted workspace" deliberately. PURE.
 */
export function platformAuditEvent(
  ev: Parameters<typeof auditView>[0] & { tenant?: unknown },
  actorEmail: string | null = null,
  actorName: string | null = null,
  workspace: { slug?: string | null; name?: string | null } | null = null
): PlatformAuditEvent {
  const slug = workspace?.slug?.trim();
  const name = workspace?.name?.trim();
  return {
    ...auditView(ev, actorEmail, actorName),
    workspaceSlug: slug || null,
    workspaceName: name || null,
  };
}

export type PlatformAuditPage = {
  events: PlatformAuditEvent[];
  /** True when more rows exist beyond this page (from a limit+1 fetch, no count query). */
  hasMore: boolean;
  /** True when a `tenant` slug filter was given but matches no workspace — lets the UI say
   *  "no such workspace" instead of the misleading "no activity yet". */
  unknownTenant: boolean;
};

/**
 * READ-ONLY cross-tenant audit query: one page of events, newest first, with actor and workspace
 * identity resolved in two batched lookups. The only impure function here. Never touches a
 * per-tenant data database.
 */
export async function listPlatformAudit(query: AdminAuditQuery): Promise<PlatformAuditPage> {
  await connectDB();

  // A slug filter resolves to an id first; an unknown slug short-circuits (no query at all) and
  // is reported distinctly, because "that workspace does not exist" and "that workspace has no
  // activity" are different answers for an operator chasing an incident.
  let tenantId: string | null = null;
  if (query.tenant) {
    const t = (await Tenant.findOne({ slug: query.tenant })
      .select('_id')
      .lean()) as unknown as { _id: unknown } | null;
    if (!t) return { events: [], hasMore: false, unknownTenant: true };
    tenantId = String(t._id);
  }

  const filter = buildPlatformAuditFilter({ tenantId, action: query.action, cursor: query.cursor });

  // limit + 1 so "Load more" is decided without a second countDocuments over an unbounded,
  // append-only collection.
  const fetched = (await AuditEvent.find(filter)
    .select('tenant action actor target meta createdAt')
    .sort({ createdAt: -1, _id: -1 })
    .limit(query.limit + 1)
    .lean()) as unknown as (AuditEventDoc & { createdAt?: Date })[];

  const { items: events, hasMore } = splitPage(fetched, query.limit);

  // Two batched identity lookups (never N+1): who acted, and in which workspace.
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
      const n = a.name?.trim();
      if (n) nameById.set(id, n);
    }
  }

  const tenantIds = collectTenantIds(events);
  const tenantById = new Map<string, { slug: string | null; name: string | null }>();
  if (tenantIds.length) {
    const tenants = (await Tenant.find({ _id: { $in: tenantIds } })
      .select('slug name')
      .lean()) as unknown as { _id: unknown; slug?: string | null; name?: string | null }[];
    for (const t of tenants) {
      tenantById.set(String(t._id), { slug: t.slug ?? null, name: t.name ?? null });
    }
  }

  return {
    events: events.map((ev) => {
      const actorId = ev.actor != null ? String(ev.actor) : null;
      const tid = ev.tenant != null ? String(ev.tenant) : null;
      return platformAuditEvent(
        ev,
        actorId ? emailById.get(actorId) ?? null : null,
        actorId ? nameById.get(actorId) ?? null : null,
        tid ? tenantById.get(tid) ?? null : null
      );
    }),
    hasMore,
    unknownTenant: false,
  };
}
