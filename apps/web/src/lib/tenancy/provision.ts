// Tenant provisioning helpers — turn a human workspace name into a safe, unique DNS slug
// and mint the control-plane docs for a new SaaS signup (Tenant + owner Membership).
//
// NODE-ONLY (touches Mongoose). Only reached from SaaS route handlers when SAAS_MODE is
// on; the self-hosted app never provisions tenants.
import { connectDB } from '@/lib/db';
import { Tenant } from '@/models/Tenant';
import { Membership } from '@/models/Membership';
import { RESERVED_SLUGS } from './host';
import { transliterate } from './translit';
import { trialEndFrom } from '@/lib/billing/trial';

/**
 * Normalise arbitrary text into a valid subdomain label: lowercase, ASCII a-z0-9 and single
 * hyphens, no leading/trailing hyphen, max 40 chars. Returns '' when nothing usable remains
 * (caller falls back, e.g. to a random label).
 *
 * `transliterate` runs FIRST so a Greek name keeps its identity ('Πλαίσιο' → 'plaisio' rather
 * than '' → a random `w-xxxxxx` label) and an accent inside a word folds away instead of
 * splitting it ('Müller' → 'muller').
 */
export function slugify(input: string): string {
  return transliterate(input)
    .replace(/[^a-z0-9]+/g, '-') // any run of non-alnum → single hyphen
    .replace(/^-+|-+$/g, '') // trim hyphens
    .slice(0, 40)
    .replace(/-+$/g, ''); // trim a hyphen the slice may have left
}

/**
 * Pick a slug that is neither reserved nor already taken. Starts from `slugify(base)` (or a
 * random label if empty), then appends -2, -3, … on collision. Bounded retry so a pathological
 * loop can't hang provisioning.
 */
export async function uniqueTenantSlug(base: string): Promise<string> {
  await connectDB();
  let root = slugify(base);
  if (!root || RESERVED_SLUGS.has(root)) root = `w-${Math.random().toString(36).slice(2, 8)}`;

  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? root : `${root}-${i + 1}`;
    if (RESERVED_SLUGS.has(candidate)) continue;
    const taken = await Tenant.exists({ slug: candidate });
    if (!taken) return candidate;
  }
  // Extremely unlikely fallback: a random label that cannot collide with the space above.
  return `${root}-${Math.random().toString(36).slice(2, 8)}`;
}

/** The isolated data database name for a tenant slug (database-per-tenant). */
export function dbNameForSlug(slug: string): string {
  return `tenant_${slug}`;
}

export type ProvisionedTenant = {
  tenantId: string;
  slug: string;
  name: string;
  dbName: string;
  plan: string;
  status: string;
};

/**
 * Create a new Tenant + an owner Membership for the given account. Slug is derived from
 * `workspaceName` (or the account's email/name) and de-duplicated. The tenant's data
 * database is named `tenant_<slug>` but not created here — Mongo makes it lazily on first
 * write, so provisioning stays a couple of cheap control-plane inserts.
 */
export async function provisionTenant(opts: {
  accountId: string;
  workspaceName: string;
  slugHint?: string;
}): Promise<ProvisionedTenant> {
  await connectDB();
  const name = (opts.workspaceName || '').trim() || 'My workspace';
  const slug = await uniqueTenantSlug(opts.slugHint || opts.workspaceName || '');
  const dbName = dbNameForSlug(slug);

  const tenant = await Tenant.create({
    slug,
    name,
    dbName,
    plan: 'free',
    status: 'trialing',
    tier: 'shared',
    // Stamp a bounded trial end so the trial actually lapses (lib/billing/trial.ts).
    trialEndsAt: trialEndFrom(new Date()),
  });

  await Membership.create({
    account: opts.accountId,
    tenant: tenant._id,
    role: 'owner',
    status: 'active',
  });

  return {
    tenantId: String(tenant._id),
    slug: tenant.slug,
    name: tenant.name,
    dbName: tenant.dbName,
    plan: String(tenant.plan),
    status: String(tenant.status),
  };
}
