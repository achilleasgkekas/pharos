// Presentational status/role pills for the SaaS superadmin console. Server-safe (no client
// hooks), styled with the existing Pharos design tokens so the console matches the app without
// touching shared CSS. Colour is a hint only — the label is always the raw string so an
// unmapped value still renders legibly (never blank) in an operator dashboard.
import type { ReactNode } from 'react';

const TONES = {
  accent: 'var(--color-accent)',
  cyan: 'var(--color-cyan)',
  purple: 'var(--color-purple)',
  gold: 'var(--color-gold)',
  red: 'var(--color-red)',
  neutral: 'var(--color-text-dim)',
} as const;

export type PillTone = keyof typeof TONES;

/** Map a Tenant.status to a tone. Unknown → neutral. PURE. */
export function tenantStatusTone(status: string): PillTone {
  switch (status) {
    case 'active':
      return 'accent';
    case 'trialing':
      return 'cyan';
    case 'pending':
      return 'gold';
    case 'suspended':
    case 'canceled':
      return 'red';
    default:
      return 'neutral';
  }
}

/** Map a Membership.status to a tone. Unknown → neutral. PURE. */
export function memberStatusTone(status: string): PillTone {
  switch (status) {
    case 'active':
      return 'accent';
    case 'invited':
      return 'gold';
    case 'removed':
      return 'red';
    default:
      return 'neutral';
  }
}

/** Map a Membership.role to a tone. Unknown → neutral. PURE. */
export function memberRoleTone(role: string): PillTone {
  switch (role) {
    case 'owner':
      return 'purple';
    case 'admin':
      return 'cyan';
    case 'member':
      return 'neutral';
    default:
      return 'neutral';
  }
}

/** A small coloured pill: transparent tinted background + coloured border/text of one tone. */
export function Pill({
  children,
  tone = 'neutral',
  title,
}: {
  children: ReactNode;
  tone?: PillTone;
  title?: string;
}) {
  const color = TONES[tone];
  return (
    <span
      title={title}
      className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-mono uppercase tracking-wider"
      style={{ color, borderColor: `color-mix(in srgb, ${color} 45%, transparent)` }}
    >
      {children}
    </span>
  );
}

/** Tenant status pill (label = raw status, empty → "—"). */
export function TenantStatusBadge({ status }: { status: string }) {
  return <Pill tone={tenantStatusTone(status)}>{status || '—'}</Pill>;
}

/** Membership status pill (label = raw status, empty → "—"). */
export function MemberStatusBadge({ status }: { status: string }) {
  return <Pill tone={memberStatusTone(status)}>{status || '—'}</Pill>;
}

/** Membership role pill (label = raw role, empty → "—"). */
export function MemberRoleBadge({ role }: { role: string }) {
  return <Pill tone={memberRoleTone(role)}>{role || '—'}</Pill>;
}
