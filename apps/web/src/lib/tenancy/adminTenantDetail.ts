// Superadmin single-tenant DETAIL (TODO §8 "Superadmin console") — READ-ONLY control-plane
// view of ONE workspace: the registry summary (reused from adminTenants) plus its member
// roster (roles/status joined to account email/name) and a role/status tally. Only meaningful
// when SAAS_MODE is on. Like the listing (#48) it reads ONLY the central registry collections
// (Tenant + Membership + Account); it never opens a per-tenant data database and never writes
// (a superadmin console is an observability surface — destructive/write ops stay manual/gated,
// NEVER an automated routine). A per-tenant db/usage stats view is a deliberately separate,
// later increment because it would touch the data plane.
//
// Split, as elsewhere in tenancy/: everything except `getTenantDetailForAdmin` is a pure
// function (no DB, no next/*) so the shaping/tally logic is fully unit-testable.
import { connectDB } from '@/lib/db';
import { Tenant, type TenantDoc } from '@/models/Tenant';
import { Membership, type MembershipDoc } from '@/models/Membership';
import { Account, type AccountDoc } from '@/models/Account';
import { summarizeTenant, type TenantSummary } from '@/lib/tenancy/adminTenants';
import {
  readTenantUsageForAdmin,
  buildUsageSummary,
  type AdminUsageSummary,
} from '@/lib/tenancy/adminTenantUsage';

/** Safe ISO serializer: valid Date/parseable → ISO string, everything else → null. */
function iso(value: unknown): string | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value as string);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export type AdminMemberView = {
  accountId: string;
  email: string;
  name: string;
  role: string;
  status: string;
  invitedBy: string | null;
  createdAt: string | null;
};

/**
 * Project one membership (joined to its account) to a display-safe operator view. Never
 * exposes the account password hash or tokens (only email/name are read from the account).
 * A missing account row (dangling membership) yields empty email/name rather than throwing.
 */
export function summarizeMember(
  membership: MembershipDoc & { createdAt?: unknown },
  account: Pick<AccountDoc, 'email' | 'name'> | undefined
): AdminMemberView {
  return {
    accountId: String(membership.account),
    email: account?.email ? String(account.email) : '',
    name: account?.name ? String(account.name) : '',
    role: String(membership.role ?? ''),
    status: String(membership.status ?? ''),
    invitedBy: membership.invitedBy ? String(membership.invitedBy) : null,
    createdAt: iso((membership as { createdAt?: unknown }).createdAt),
  };
}

export type MemberTally = {
  total: number;
  active: number;
  invited: number;
  removed: number;
  owners: number;
  admins: number;
  members: number;
};

/**
 * Count members by status and by role. Roles are counted only for ACTIVE members (an
 * invited-but-unaccepted or removed row is not a live owner/admin/member seat), so
 * `owners` here reflects actual current owners — useful for spotting an ownerless workspace.
 * PURE.
 */
export function tallyMembers(members: AdminMemberView[]): MemberTally {
  const tally: MemberTally = {
    total: members.length,
    active: 0,
    invited: 0,
    removed: 0,
    owners: 0,
    admins: 0,
    members: 0,
  };
  for (const m of members) {
    if (m.status === 'active') tally.active++;
    else if (m.status === 'invited') tally.invited++;
    else if (m.status === 'removed') tally.removed++;

    if (m.status !== 'active') continue;
    if (m.role === 'owner') tally.owners++;
    else if (m.role === 'admin') tally.admins++;
    else if (m.role === 'member') tally.members++;
  }
  return tally;
}

export type AdminTenantDetail = {
  format: 'pharos.admin-tenant-detail';
  version: 2;
  generatedAt: string;
  tenant: TenantSummary;
  memberCounts: MemberTally;
  members: AdminMemberView[];
  /**
   * Control-plane usage rollup (AI consumption + storage footprint gauge). Sourced from the
   * central Usage ledger only — NEVER the per-tenant data database. Empty for the default /
   * self-hosted tenant (which writes no Usage docs).
   */
  usage: AdminUsageSummary;
};

/**
 * Assemble the stable detail envelope. PURE: tally derived from the member list, never trusted.
 * `usage` defaults to an empty summary so pure callers/tests need not thread the ledger through.
 */
export function buildTenantDetail(
  tenant: TenantSummary,
  members: AdminMemberView[],
  generatedAt: Date,
  usage: AdminUsageSummary = buildUsageSummary([])
): AdminTenantDetail {
  const gen =
    generatedAt instanceof Date && !Number.isNaN(generatedAt.getTime()) ? generatedAt : new Date(0);
  return {
    format: 'pharos.admin-tenant-detail',
    version: 2,
    generatedAt: gen.toISOString(),
    tenant,
    memberCounts: tallyMembers(members),
    members,
    usage,
  };
}

/**
 * READ-ONLY single-tenant detail by slug: the registry summary + full member roster. The only
 * impure function here. Returns null when no tenant has that slug (caller → 404). Touches ONLY
 * the central registry (Tenant/Membership/Account); never a per-tenant data database.
 */
export async function getTenantDetailForAdmin(
  slug: string,
  generatedAt: Date = new Date()
): Promise<AdminTenantDetail | null> {
  const s = typeof slug === 'string' ? slug.trim().toLowerCase() : '';
  if (!s) return null;

  await connectDB();
  const tenant = (await Tenant.findOne({ slug: s }).lean()) as unknown as TenantDoc | null;
  if (!tenant) return null;

  const memberships = (await Membership.find({ tenant: tenant._id })
    .select('account role status invitedBy createdAt')
    .sort({ createdAt: 1, _id: 1 })
    .lean()) as unknown as (MembershipDoc & { createdAt?: Date })[];

  const accountIds = memberships.map((m) => m.account);
  const accounts = (await Account.find({ _id: { $in: accountIds } })
    .select('email name')
    .lean()) as unknown as AccountDoc[];
  const byId = new Map(accounts.map((a) => [String(a._id), a]));

  const members = memberships.map((m) => summarizeMember(m, byId.get(String(m.account))));
  // Control-plane usage rollup (registry Usage ledger only; no per-tenant data db opened).
  const usage = await readTenantUsageForAdmin(String(tenant._id));
  return buildTenantDetail(summarizeTenant(tenant), members, generatedAt, usage);
}
