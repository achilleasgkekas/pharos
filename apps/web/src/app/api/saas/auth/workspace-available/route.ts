import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { Tenant } from '@/models/Tenant';
import { saasGuard, saasAuthGate } from '@/lib/tenancy/saasApi';
import { rateLimit, clientIp } from '@/lib/apiAuth';
import { slugify } from '@/lib/tenancy/provision';
import { RESERVED_SLUGS, baseDomain } from '@/lib/tenancy/host';
import { saasMode } from '@/lib/tenancy/saasMode';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/saas/auth/workspace-available?name=<workspace name>
 *
 * Signup helper: turn a typed workspace name into the subdomain it WOULD get and say whether
 * that address is free. The subdomain (slug) is derived once at provisioning and is immutable
 * forever after (renaming a workspace only changes its display name), so the one moment to get
 * it right is here — this powers the live "yourname.<domain> — available ✓" preview on the
 * signup form. The signup POST re-checks authoritatively; this is UX, not the gate, so a race
 * between check and submit is caught there with a 409.
 *
 * Public + unauthenticated (it runs before an account exists), so it is rate-limited per IP and
 * leaks nothing beyond "is this slug taken" — never who owns it. SaaS-mode only (404 off).
 */
export async function GET(req: NextRequest) {
  if (!saasMode()) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return saasGuard(async () => {
    const gate = saasAuthGate();
    if (gate) return gate;

    const limited = rateLimit(`slug-check:${clientIp(req)}`);
    if (limited) return limited;

    const name = new URL(req.url).searchParams.get('name') ?? '';
    const slug = slugify(name);

    let reason: 'ok' | 'empty' | 'reserved' | 'taken' = 'ok';
    if (!slug) reason = 'empty';
    else if (RESERVED_SLUGS.has(slug)) reason = 'reserved';
    else {
      await connectDB();
      if (await Tenant.exists({ slug })) reason = 'taken';
    }

    return NextResponse.json({
      name,
      slug,
      host: slug ? `${slug}.${baseDomain()}` : '',
      available: reason === 'ok',
      reason,
    });
  });
}
