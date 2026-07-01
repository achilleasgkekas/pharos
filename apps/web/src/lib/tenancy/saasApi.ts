// Shared plumbing for the /api/saas/* route handlers. NODE-ONLY.
//
// Every SaaS auth route must be inert when SAAS_MODE is off (self-hosted app) and must
// fail closed when AUTH_SECRET is missing. `saasAuthGate()` centralises both checks so a
// route reads: `const gate = saasAuthGate(); if (gate) return gate;`.
import { NextResponse } from 'next/server';
import { saasMode } from './saasMode';
import { accountAuthConfigured } from './accountSession';
import { Membership } from '@/models/Membership';
import { Tenant, type TenantDoc } from '@/models/Tenant';

/**
 * Returns a NextResponse to short-circuit with, or null to proceed:
 *   - SAAS_MODE off → 404 (the endpoints don't exist for the self-hosted app).
 *   - AUTH_SECRET unset → 500 (fail closed; can't mint sessions).
 */
export function saasAuthGate(): NextResponse | null {
  if (!saasMode()) {
    return NextResponse.json({ error: 'SaaS mode is not enabled' }, { status: 404 });
  }
  if (!accountAuthConfigured()) {
    return NextResponse.json({ error: 'AUTH_SECRET is not configured' }, { status: 500 });
  }
  return null;
}

export type AccountTenant = {
  tenantId: string;
  slug: string;
  name: string;
  role: string;
  plan: string;
  status: string;
};

/**
 * List the tenants an account belongs to (active memberships), with each tenant's slug /
 * plan / status and the account's role there. Used by login + session responses so the
 * client knows which workspace(s) to route into.
 */
export async function accountTenants(accountId: string): Promise<AccountTenant[]> {
  const memberships = await Membership.find({ account: accountId, status: 'active' })
    .select('tenant role')
    .lean();
  if (memberships.length === 0) return [];

  const tenantIds = memberships.map((m) => m.tenant);
  const tenants = (await Tenant.find({ _id: { $in: tenantIds } })
    .select('slug name plan status')
    .lean()) as unknown as TenantDoc[];
  const byId = new Map(tenants.map((t) => [String(t._id), t]));

  const out: AccountTenant[] = [];
  for (const m of memberships) {
    const t = byId.get(String(m.tenant));
    if (!t) continue;
    out.push({
      tenantId: String(t._id),
      slug: t.slug,
      name: t.name,
      role: String(m.role),
      plan: String(t.plan),
      status: String(t.status),
    });
  }
  return out;
}
