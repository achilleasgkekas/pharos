// SaaS superadmin WORKSPACE DETAIL page (/admin/tenants/[slug]). Consumes the already-built
// read-only detail reader (`getTenantDetailForAdmin`, #49/#50) directly server-side: registry
// summary + member roster + role/status tally + control-plane usage rollup. Unknown slug →
// notFound(). READ-ONLY (registry Tenant/Membership/Account + Usage ledger only; never a
// per-tenant data db, never a write). Self-gates for the self-hosted app so the OSS build is
// byte-for-byte unchanged.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireSuperadminPage } from '@/lib/tenancy/superadminPage';
import { getTenantDetailForAdmin } from '@/lib/tenancy/adminTenantDetail';
import { StatTile } from '@/components/saas/StatTile';
import {
  TenantStatusBadge,
  MemberStatusBadge,
  MemberRoleBadge,
  Pill,
} from '@/components/saas/StatusBadge';
import { formatInt, formatBytes, formatCostMicros, formatWhen } from '@/components/saas/format';

export const dynamic = 'force-dynamic';

/** Definition-list row: a mono label and its value. Value falls back to "—" when empty. */
function Field({ label, children }: { label: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <span className="text-[10px] font-mono uppercase tracking-wider text-[color:var(--color-text-faint)]">
        {label}
      </span>
      <span className="text-sm text-[color:var(--color-text)]">{children ?? '—'}</span>
    </div>
  );
}

export default async function AdminTenantDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await requireSuperadminPage();
  const { slug } = await params;
  const detail = await getTenantDetailForAdmin(slug);
  if (!detail) notFound();

  const t = detail.tenant;
  const mc = detail.memberCounts;
  const u = detail.usage;
  const latest = u.latestPeriod;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/tenants"
            className="text-sm text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)]"
          >
            ← Workspaces
          </Link>
          <h1 className="font-display text-xl font-bold">{t.name || t.slug || '—'}</h1>
          <TenantStatusBadge status={t.status} />
        </div>
        <span className="text-xs text-[color:var(--color-text-faint)]">
          generated {formatWhen(detail.generatedAt)}
        </span>
      </div>

      {/* Registry summary + member tally */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-4">
          <h2 className="mb-2 text-[11px] font-mono uppercase tracking-wider text-[color:var(--color-text-faint)]">
            Registry
          </h2>
          <dl className="divide-y divide-[color:var(--color-border)]">
            <Field label="Slug">{t.slug || '—'}</Field>
            <Field label="Plan">
              <span className="capitalize">{t.plan || '—'}</span>
            </Field>
            <Field label="Tier">
              <span className="capitalize">{t.tier || '—'}</span>
            </Field>
            <Field label="Custom domain">{t.customDomain || '—'}</Field>
            <Field label="Billing">
              <div className="flex flex-wrap justify-end gap-1">
                {t.billingLinked ? <Pill tone="gold">linked</Pill> : <span>—</span>}
                {t.aiByoKey && <Pill tone="cyan">byo-key</Pill>}
              </div>
            </Field>
            <Field label="Trial ends">{formatWhen(t.trialEndsAt)}</Field>
            <Field label="Erasure scheduled">
              {t.erasureScheduledAt ? (
                <Pill tone="red">{formatWhen(t.erasureScheduledAt)}</Pill>
              ) : (
                '—'
              )}
            </Field>
            <Field label="Created">{formatWhen(t.createdAt)}</Field>
            <Field label="Updated">{formatWhen(t.updatedAt)}</Field>
          </dl>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-2">
            <StatTile label="Members" value={formatInt(mc.total)} accent="accent" />
            <StatTile label="Active" value={formatInt(mc.active)} accent="cyan" />
            <StatTile
              label="Owners"
              value={formatInt(mc.owners)}
              sub={mc.owners === 0 ? 'ownerless!' : undefined}
              accent={mc.owners === 0 ? 'red' : 'purple'}
            />
            <StatTile
              label="Invited"
              value={formatInt(mc.invited)}
              sub={`${formatInt(mc.removed)} removed`}
              accent="gold"
            />
          </div>
          <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-4">
            <h2 className="mb-2 text-[11px] font-mono uppercase tracking-wider text-[color:var(--color-text-faint)]">
              Usage {latest ? `· latest ${latest}` : ''}
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <StatTile
                label="AI calls (total)"
                value={formatInt(u.totals.aiCalls)}
                sub={`${formatInt(u.periodCount)} periods`}
                accent="accent"
              />
              <StatTile
                label="AI tokens (total)"
                value={formatInt(u.totals.aiInputTokens + u.totals.aiOutputTokens)}
                sub={`${formatInt(u.totals.aiInputTokens)} in · ${formatInt(u.totals.aiOutputTokens)} out`}
                accent="cyan"
              />
              <StatTile
                label="AI cost (total)"
                value={formatCostMicros(u.totals.aiCostMicros)}
                accent="gold"
              />
              <StatTile
                label="Storage"
                value={formatBytes(u.latestStorageBytes)}
                sub={u.latestStorageMeasuredAt ? formatWhen(u.latestStorageMeasuredAt) : 'not measured'}
                accent="purple"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Member roster */}
      <section>
        <h2 className="mb-2 text-[11px] font-mono uppercase tracking-wider text-[color:var(--color-text-faint)]">
          Members · {mc.total}
        </h2>
        {detail.members.length === 0 ? (
          <p className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-4 text-sm text-[color:var(--color-text-dim)]">
            No members on this workspace.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-[color:var(--color-border)]">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-[color:var(--color-border)] bg-[color:var(--color-surface)] text-[10px] font-mono uppercase tracking-wider text-[color:var(--color-text-faint)]">
                  <th className="px-4 py-2 font-normal">Account</th>
                  <th className="px-4 py-2 font-normal">Role</th>
                  <th className="px-4 py-2 font-normal">Status</th>
                  <th className="px-4 py-2 font-normal">Joined</th>
                </tr>
              </thead>
              <tbody>
                {detail.members.map((m) => (
                  <tr
                    key={m.accountId}
                    className="border-b border-[color:var(--color-border)] last:border-0"
                  >
                    <td className="px-4 py-2.5">
                      <div className="text-[color:var(--color-text)]">{m.email || '(no email)'}</div>
                      {m.name && (
                        <div className="text-xs text-[color:var(--color-text-faint)]">{m.name}</div>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <MemberRoleBadge role={m.role} />
                    </td>
                    <td className="px-4 py-2.5">
                      <MemberStatusBadge status={m.status} />
                    </td>
                    <td className="px-4 py-2.5 text-xs text-[color:var(--color-text-dim)]">
                      {formatWhen(m.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
