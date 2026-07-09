import { describe, it, expect } from 'vitest';
import {
  summarizeMember,
  tallyMembers,
  buildTenantDetail,
  type AdminMemberView,
} from './adminTenantDetail';
import type { MembershipDoc } from '@/models/Membership';
import type { TenantSummary } from '@/lib/tenancy/adminTenants';

// PURE helpers only. `getTenantDetailForAdmin` is the node-only registry reader and the route
// is superadmin-gated (404 when SAAS_MODE off / console not enabled).

function membership(over: Record<string, unknown>): MembershipDoc & { createdAt?: unknown } {
  return {
    account: 'acc1',
    tenant: 'ten1',
    role: 'member',
    status: 'active',
    invitedBy: null,
    ...over,
  } as unknown as MembershipDoc & { createdAt?: unknown };
}

describe('summarizeMember', () => {
  it('joins account email/name and serializes createdAt to ISO', () => {
    const m = membership({
      account: 'a1',
      role: 'owner',
      status: 'active',
      invitedBy: 'a0',
      createdAt: new Date('2026-07-01T00:00:00.000Z'),
    });
    expect(summarizeMember(m, { email: 'O@x.com', name: 'Owner' } as never)).toEqual({
      accountId: 'a1',
      email: 'O@x.com',
      name: 'Owner',
      role: 'owner',
      status: 'active',
      invitedBy: 'a0',
      createdAt: '2026-07-01T00:00:00.000Z',
    });
  });

  it('handles a dangling membership (no account) without throwing', () => {
    const m = membership({ account: 'gone', invitedBy: null, createdAt: 'nope' });
    const v = summarizeMember(m, undefined);
    expect(v.email).toBe('');
    expect(v.name).toBe('');
    expect(v.invitedBy).toBe(null);
    expect(v.createdAt).toBe(null); // invalid date → null
  });
});

describe('tallyMembers', () => {
  const mk = (over: Partial<AdminMemberView>): AdminMemberView => ({
    accountId: 'x',
    email: '',
    name: '',
    role: 'member',
    status: 'active',
    invitedBy: null,
    createdAt: null,
    ...over,
  });

  it('counts by status and counts roles only for active members', () => {
    const t = tallyMembers([
      mk({ role: 'owner', status: 'active' }),
      mk({ role: 'admin', status: 'active' }),
      mk({ role: 'member', status: 'active' }),
      mk({ role: 'admin', status: 'invited' }), // invited → not an active admin
      mk({ role: 'owner', status: 'removed' }), // removed → not a live owner
    ]);
    expect(t).toEqual({
      total: 5,
      active: 3,
      invited: 1,
      removed: 1,
      owners: 1,
      admins: 1,
      members: 1,
    });
  });

  it('is all-zero for an empty roster', () => {
    expect(tallyMembers([])).toEqual({
      total: 0,
      active: 0,
      invited: 0,
      removed: 0,
      owners: 0,
      admins: 0,
      members: 0,
    });
  });
});

describe('buildTenantDetail', () => {
  const tenant = { id: 't1', slug: 'acme', name: 'Acme' } as unknown as TenantSummary;
  const members: AdminMemberView[] = [
    {
      accountId: 'a1',
      email: 'o@x.com',
      name: 'O',
      role: 'owner',
      status: 'active',
      invitedBy: null,
      createdAt: null,
    },
  ];
  const gen = new Date('2026-07-07T10:00:00.000Z');

  it('emits a stable envelope with derived member counts', () => {
    const out = buildTenantDetail(tenant, members, gen);
    expect(out.format).toBe('pharos.admin-tenant-detail');
    expect(out.version).toBe(2);
    expect(out.generatedAt).toBe('2026-07-07T10:00:00.000Z');
    expect(out.tenant).toBe(tenant);
    expect(out.members).toHaveLength(1);
    expect(out.memberCounts.total).toBe(1);
    expect(out.memberCounts.owners).toBe(1);
  });

  it('defaults usage to an empty summary when none is passed', () => {
    const out = buildTenantDetail(tenant, members, gen);
    expect(out.usage.periodCount).toBe(0);
    expect(out.usage.periods).toEqual([]);
    expect(out.usage.latestPeriod).toBe(null);
    expect(out.usage.totals.aiCalls).toBe(0);
  });

  it('carries a supplied usage summary through verbatim', () => {
    const usage = {
      periodCount: 1,
      totals: { aiCalls: 5, aiInputTokens: 0, aiOutputTokens: 0, aiCostMicros: 0 },
      latestPeriod: '2026-07',
      latestStorageBytes: 0,
      latestStorageMeasuredAt: null,
      periods: [],
    };
    const out = buildTenantDetail(tenant, members, gen, usage);
    expect(out.usage).toBe(usage);
    expect(out.usage.latestPeriod).toBe('2026-07');
  });

  it('coerces an invalid generatedAt to epoch', () => {
    const out = buildTenantDetail(tenant, [], new Date('nope'));
    expect(out.generatedAt).toBe(new Date(0).toISOString());
    expect(out.memberCounts.total).toBe(0);
  });
});
