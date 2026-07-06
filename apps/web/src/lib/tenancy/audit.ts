// SaaS control-plane audit trail — PURE helpers (validation, redaction, serialization) plus
// a node-only recorder. Only meaningful when SAAS_MODE is on; the recorder is a safe no-op
// for the default/self-hosted tenant, so calling it from a shared code path is harmless.
//
// Design: everything except `recordAudit` is a pure function with no DB/import side effects,
// so it is fully unit-testable and client-safe. The recorder swallows its own errors — an
// audit-write failure must never break the user action it is logging.
import type { TenantContext } from './context';

/**
 * The closed set of auditable actions. Machine-readable verbs in `noun.verb` form. Kept as
 * a plain list (not a mongoose enum) so the recorder validates while the schema stays
 * migration-free. Grouped by concern: membership, invites, billing/plan, workspace.
 */
export const AUDIT_ACTIONS = [
  'member.added',
  'member.role_changed',
  'member.removed',
  'invite.sent',
  'invite.resent',
  'invite.accepted',
  'invite.revoked',
  'plan.changed',
  'billing.checkout_started',
  'billing.portal_opened',
  'workspace.created',
  'workspace.updated',
  'workspace.canceled',
  'workspace.suspended',
  'workspace.reactivated',
  'workspace.erasure_requested',
  'workspace.erasure_canceled',
  'ai_key.set',
  'ai_key.cleared',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/** True for a known auditable action verb. */
export function isAuditAction(x: unknown): x is AuditAction {
  return typeof x === 'string' && (AUDIT_ACTIONS as readonly string[]).includes(x);
}

/**
 * Coerce arbitrary input (e.g. a `?action=` query param) to a known action, else null.
 * Case-insensitive + trimmed so callers need not pre-normalize.
 */
export function parseAuditAction(x: unknown): AuditAction | null {
  if (typeof x !== 'string') return null;
  const v = x.trim().toLowerCase();
  return isAuditAction(v) ? v : null;
}

// Keys that must never land in the audit meta, even if a caller passes them by accident.
// Matched case-insensitively as substrings so `resetToken`, `passwordHash`, `apiSecret`,
// etc. are all caught. The audit collection is explicitly a secret-free zone.
const SENSITIVE_KEY_RE = /(token|password|secret|hash|cookie|authorization|apikey|api_key)/i;

/**
 * Strip sensitive keys from a meta object and drop non-plain values, returning a shallow,
 * display-safe copy (or null if empty/invalid). Only scalars, arrays, and nested plain
 * objects survive — functions, class instances, and secret-looking keys are removed. Depth
 * is bounded to avoid pathological nesting.
 */
export function redactMeta(meta: unknown, depth = 0): Record<string, unknown> | null {
  if (meta == null || typeof meta !== 'object' || Array.isArray(meta)) return null;
  if (depth > 4) return null;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(meta as Record<string, unknown>)) {
    if (SENSITIVE_KEY_RE.test(key)) continue;
    if (value == null) continue;
    const t = typeof value;
    if (t === 'string' || t === 'number' || t === 'boolean') {
      out[key] = value;
    } else if (Array.isArray(value)) {
      // Keep only scalar array members; drop nested structures to keep meta flat + safe.
      const scalars = value.filter(
        (v) => v != null && ['string', 'number', 'boolean'].includes(typeof v)
      );
      if (scalars.length) out[key] = scalars;
    } else if (t === 'object') {
      const nested = redactMeta(value, depth + 1);
      if (nested) out[key] = nested;
    }
    // functions/symbols/bigint silently dropped
  }
  return Object.keys(out).length ? out : null;
}

export type AuditView = {
  id: string;
  action: string;
  actor: string | null;
  // Human-readable actor identity, resolved by the read route from a batched lookup. Both are
  // null for system-originated events (no actor) or when the account is no longer resolvable
  // (e.g. deleted); `actorName` is also null when the account never set a display name. Purely
  // for display; never a secret.
  actorEmail: string | null;
  actorName: string | null;
  target: string | null;
  meta: Record<string, unknown> | null;
  createdAt: string | null;
};

/**
 * Distinct, stringified, non-null actor ids across a batch of events. Pure so the read
 * route can resolve every actor's email in ONE `_id: { $in }` query instead of N+1 lookups.
 * System events (null actor) contribute nothing.
 */
export function collectActorIds(events: readonly { actor?: unknown }[]): string[] {
  const seen = new Set<string>();
  for (const ev of events) {
    if (ev.actor != null) seen.add(String(ev.actor));
  }
  return [...seen];
}

function toIso(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  const t = d instanceof Date ? d : new Date(d);
  return Number.isNaN(t.getTime()) ? null : t.toISOString();
}

/**
 * Client-safe projection of an AuditEvent row. By construction it only exposes whitelisted
 * fields, so a tokenHash or other stray secret column could never leak through it. `actor`
 * is a stringified Account id (null for system events). `actorEmail`/`actorName` are the
 * resolved display identity when the read route passes them (from a batched Account lookup),
 * else null. Both are positional + optional so every existing caller stays unchanged.
 */
export function auditView(
  ev: {
    _id: unknown;
    action?: string | null;
    actor?: unknown;
    target?: string | null;
    meta?: unknown;
    createdAt?: Date | string | null;
  },
  actorEmail: string | null = null,
  actorName: string | null = null
): AuditView {
  return {
    id: String(ev._id),
    action: ev.action ?? '',
    actor: ev.actor != null ? String(ev.actor) : null,
    actorEmail: actorEmail ?? null,
    actorName: actorName ?? null,
    target: ev.target ?? null,
    // Re-redact on the way out as a defence-in-depth belt: even a legacy row written before
    // the recorder redacted is scrubbed before it reaches a client.
    meta: redactMeta(ev.meta),
    createdAt: toIso(ev.createdAt),
  };
}

/**
 * The slice of a TenantContext the recorder actually reads. Widening the param to this
 * (rather than the full `TenantContext`) lets both a real `session.ctx` AND a minimal
 * `{ isDefault, tenantId }` — built by `auditCtx` for the unauthenticated invite-accept and
 * the system-originated Stripe webhook, neither of which has a workspace session — satisfy it.
 */
export type AuditCtx = Pick<TenantContext, 'isDefault' | 'tenantId'>;

/**
 * Build an audit context from a bare tenant id, for code paths that have a resolved tenant
 * but no workspace session (invite accept, billing webhook). A resolved tenant is by
 * definition never the implicit default; a null/empty id makes `recordAudit` a no-op.
 */
export function auditCtx(tenantId: string | null | undefined): AuditCtx {
  return { isDefault: false, tenantId: tenantId ? String(tenantId) : null };
}

export type RecordAuditInput = {
  action: AuditAction;
  /** Account id of the human actor; omit/null for system-originated events. */
  actor?: string | null;
  /** Display-safe pointer at the subject (email/slug/short id). Never a secret. */
  target?: string | null;
  /** Arbitrary context; redacted before persisting. */
  meta?: Record<string, unknown> | null;
};

/**
 * Append one audit event for a tenant. NODE-ONLY (imports the model lazily). Safe to call
 * from any workspace mutation:
 *   - no-op for the default/self-hosted tenant (SAAS_MODE off ⇒ nothing to audit),
 *   - no-op when the tenant id is missing or the action is unknown,
 *   - never throws — an audit failure is logged, not propagated, so it can't break the
 *     user action it records.
 * Returns true if a row was written, false otherwise.
 */
export async function recordAudit(ctx: AuditCtx, input: RecordAuditInput): Promise<boolean> {
  if (ctx.isDefault || !ctx.tenantId) return false;
  if (!isAuditAction(input.action)) return false;
  try {
    const { AuditEvent } = await import('@/models/AuditEvent');
    await AuditEvent.create({
      tenant: ctx.tenantId,
      actor: input.actor ?? null,
      action: input.action,
      target: input.target ?? null,
      meta: redactMeta(input.meta),
    });
    return true;
  } catch (err) {
    // Best-effort: audit must never be load-bearing for correctness.
    console.error('[audit] failed to record', input.action, err);
    return false;
  }
}
