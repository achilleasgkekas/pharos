// PURE + client-safe presentation helpers for the workspace Activity panel
// ((saas)/account/workspace/activity). Turns a control-plane AuditView row (see
// lib/tenancy/audit.ts) into a display-ready shape: a human action label, a colour tone,
// an actor label, and a compact meta summary. Kept pure (no DB, no next/*, no React) so the
// mapping is fully unit-testable and identical wherever it renders. Only meaningful in
// SAAS_MODE; the self-hosted app never records or shows audit events.
import type { PillTone } from './StatusBadge';

/** The whitelisted AuditView shape this module consumes (structurally matches auditView()'s
 *  return). Declared locally so this pure helper never pulls the node-only audit recorder. */
export type ActivityInput = {
  id: string;
  action: string;
  actor: string | null;
  actorEmail: string | null;
  actorName: string | null;
  target: string | null;
  meta: Record<string, unknown> | null;
  createdAt: string | null;
};

/** A display-ready activity row for the Activity panel. */
export type ActivityRow = {
  id: string;
  /** Human-readable action, e.g. "Member added". */
  label: string;
  /** Colour hint for the action pill. */
  tone: PillTone;
  /** Who did it: display name, else email, else "System" for actor-less events. */
  actor: string;
  /** What was acted on (email/slug/short id), or null. */
  target: string | null;
  /** Flat "key: value · key: value" summary of the redacted meta, or null when empty. */
  meta: string | null;
  /** ISO timestamp (or null) — formatted for display by the caller (format.formatWhen). */
  createdAt: string | null;
};

/**
 * Human labels for the known audit verbs (AUDIT_ACTIONS). Kept as an explicit map so the
 * copy is deliberate; an unmapped/legacy verb falls back to a derived title (see actionLabel)
 * so the list never shows a blank or a raw machine string awkwardly.
 */
const ACTION_LABELS: Record<string, string> = {
  'member.added': 'Member added',
  'member.role_changed': 'Role changed',
  'member.removed': 'Member removed',
  'member.left': 'Member left',
  'invite.sent': 'Invite sent',
  'invite.resent': 'Invite resent',
  'invite.accepted': 'Invite accepted',
  'invite.revoked': 'Invite revoked',
  'plan.changed': 'Plan changed',
  'billing.checkout_started': 'Checkout started',
  'billing.portal_opened': 'Billing portal opened',
  'workspace.created': 'Workspace created',
  'workspace.updated': 'Workspace updated',
  'workspace.canceled': 'Workspace canceled',
  'workspace.suspended': 'Workspace suspended',
  'workspace.reactivated': 'Workspace reactivated',
  'workspace.erasure_requested': 'Erasure requested',
  'workspace.erasure_canceled': 'Erasure canceled',
  'workspace.data_exported': 'Data exported',
  'workspace.files_manifested': 'Files manifested',
  'platform.ai_key_set': 'Platform AI key set',
  'platform.ai_key_cleared': 'Platform AI key cleared',
  'platform.firewall_unban_requested': 'Firewall unban requested',
  'billing.activated_by_code': 'Activated by code',
  'billing.activation_rejected': 'Activation rejected',
  'ai_key.set': 'AI key set',
  'ai_key.cleared': 'AI key cleared',
};

/**
 * Human-readable label for an audit action. Known verbs use the curated copy; an unknown
 * verb is title-cased from its `noun.verb`/`noun_verb` form (e.g. "foo.bar_baz" → "Foo bar
 * baz") so an unmapped action still reads legibly. Blank input → "Activity".
 */
export function actionLabel(action: unknown): string {
  if (typeof action !== 'string' || !action.trim()) return 'Activity';
  const key = action.trim();
  if (ACTION_LABELS[key]) return ACTION_LABELS[key];
  const words = key
    .replace(/[._]+/g, ' ')
    .trim()
    .split(/\s+/);
  const joined = words.join(' ').toLowerCase();
  return joined.charAt(0).toUpperCase() + joined.slice(1);
}

/**
 * Colour tone for an action pill, keyed off the noun prefix and destructive-verb suffix.
 * Destructive/negative outcomes (removed/revoked/canceled/suspended/cleared) always read red
 * regardless of noun, so a member-removal stands out from a member-add. PURE.
 */
export function actionTone(action: unknown): PillTone {
  if (typeof action !== 'string' || !action) return 'neutral';
  const a = action.toLowerCase();
  if (/(removed|revoked|canceled|cancelled|suspended|cleared)$/.test(a)) return 'red';
  const noun = a.split('.')[0];
  switch (noun) {
    case 'member':
      return 'cyan';
    case 'invite':
      return 'gold';
    case 'plan':
    case 'billing':
      return 'purple';
    case 'workspace':
      return 'accent';
    default:
      return 'neutral';
  }
}

/** Who performed the action: display name, else email, else "System" (actor-less events). */
export function actorLabel(row: Pick<ActivityInput, 'actorName' | 'actorEmail'>): string {
  const name = row.actorName?.trim();
  if (name) return name;
  const email = row.actorEmail?.trim();
  if (email) return email;
  return 'System';
}

// Cap how many meta entries and how long a single value renders, so a pathological row can't
// blow up the activity list.
const META_MAX_ENTRIES = 6;
const META_VALUE_MAX = 60;

/**
 * Compact one-line summary of the (already-redacted) meta object: "key: value · key: value".
 * Scalars render inline; arrays join with commas; nested objects collapse to "{…}". Returns
 * null when there is nothing to show. PURE — never throws on odd input.
 */
export function metaSummary(meta: unknown): string | null {
  if (meta == null || typeof meta !== 'object' || Array.isArray(meta)) return null;
  const parts: string[] = [];
  for (const [key, value] of Object.entries(meta as Record<string, unknown>)) {
    if (parts.length >= META_MAX_ENTRIES) break;
    if (value == null) continue;
    let text: string;
    if (Array.isArray(value)) {
      text = value.map((v) => String(v)).join(', ');
    } else if (typeof value === 'object') {
      text = '{…}';
    } else {
      text = String(value);
    }
    if (!text) continue;
    if (text.length > META_VALUE_MAX) text = `${text.slice(0, META_VALUE_MAX - 1)}…`;
    parts.push(`${key}: ${text}`);
  }
  return parts.length ? parts.join(' · ') : null;
}

/** Map one AuditView row to a display-ready ActivityRow. PURE. */
export function toActivityRow(row: ActivityInput): ActivityRow {
  return {
    id: row.id,
    label: actionLabel(row.action),
    tone: actionTone(row.action),
    actor: actorLabel(row),
    target: row.target,
    meta: metaSummary(row.meta),
    createdAt: row.createdAt,
  };
}

/** Map a batch of AuditView rows to display rows, preserving order. PURE. */
export function toActivityRows(rows: readonly ActivityInput[]): ActivityRow[] {
  return rows.map(toActivityRow);
}
