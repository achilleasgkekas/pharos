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
import { connectDB } from '@/lib/db';

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

/**
 * Wrap a SaaS route handler body so an unexpected thrown error becomes a clean `{ error }`
 * 500 (JSON) instead of Next's default HTML 500 page. Mirrors the catch in the v1 `withAuth`
 * wrapper (`lib/apiAuth.ts`). Gate checks, validation, and all deliberate short-circuits
 * still return their own responses — this only catches the unforeseen throw (e.g. a DB
 * failure mid-handler) so the client always sees the uniform `{ error }` shape.
 *
 * Usage: `export async function GET() { return saasGuard(async () => { ... }); }`
 */
export async function saasGuard(fn: () => Promise<NextResponse>): Promise<NextResponse> {
  try {
    return await fn();
  } catch (e) {
    const message = (e as Error).message?.slice(0, 200) || 'Server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
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
  // The connection is opened with bufferCommands:false (lib/db.ts), so a query issued before
  // it resolves THROWS instead of waiting. Most callers already connect first themselves
  // (e.g. workspaceSession.ts) but the root layout's navbar path (getSessionUser ->
  // saasSessionUser -> here) does not and is often the very first DB touch in a request —
  // right after a restart/redeploy that throw was silently read as "not signed in" by
  // saasSessionUser's fail-closed catch, making the whole navbar disappear for that one
  // request. connectDB() is idempotent (cached connection), so calling it again here is free
  // for callers that already did.
  await connectDB();
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
