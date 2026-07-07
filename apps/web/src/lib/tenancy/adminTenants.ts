// Superadmin cross-tenant listing (TODO §8 "Superadmin console") — READ-ONLY control-plane
// view of every Tenant, with pagination + optional status/search filtering. Only meaningful
// when SAAS_MODE is on. This reads ONLY the central registry `Tenant` collection; it never
// opens a per-tenant data database and never writes anything (a superadmin console starts as
// an observability surface — destructive ops stay manual/gated, NEVER an automated routine).
//
// Split, as elsewhere in tenancy/: everything except `listTenantsForAdmin` is a pure function
// (no DB, no next/*) so the shaping/paging/filter logic is fully unit-testable.
import { connectDB } from '@/lib/db';
import { Tenant, type TenantDoc } from '@/models/Tenant';

// The Tenant.status enum, mirrored here so the query parser can validate a `?status=` filter
// without importing the mongoose schema. Kept in sync with models/Tenant.ts by the test.
export const TENANT_STATUSES = ['pending', 'trialing', 'active', 'suspended', 'canceled'] as const;
export type TenantStatus = (typeof TENANT_STATUSES)[number];

export const MAX_ADMIN_PAGE = 100;
export const DEFAULT_ADMIN_PAGE = 50;

export type AdminTenantQuery = {
  limit: number;
  offset: number;
  status: TenantStatus | null;
  q: string | null;
};

export type TenantSummary = {
  id: string;
  slug: string;
  name: string;
  plan: string;
  status: string;
  tier: string;
  customDomain: string | null;
  trialEndsAt: string | null;
  erasureScheduledAt: string | null;
  billingLinked: boolean;
  aiByoKey: boolean;
  createdAt: string | null;
  updatedAt: string | null;
};

/** Safe ISO serializer: valid Date/parseable → ISO string, everything else → null. */
function iso(value: unknown): string | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value as string);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Clamp/validate raw query-string params into a well-formed `AdminTenantQuery`.
 *   - limit: 1..MAX_ADMIN_PAGE, default DEFAULT_ADMIN_PAGE (non-numeric/≤0 → default).
 *   - offset: floored, ≥0 (non-numeric/negative → 0).
 *   - status: only a known Tenant status survives, else null (no filter).
 *   - q: trimmed search string (slug/name/customDomain), blank → null.
 */
export function parseAdminTenantQuery(params: URLSearchParams): AdminTenantQuery {
  const rawLimit = Number(params.get('limit'));
  const limit =
    Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.min(MAX_ADMIN_PAGE, Math.floor(rawLimit))
      : DEFAULT_ADMIN_PAGE;

  const rawOffset = Number(params.get('offset'));
  const offset = Number.isFinite(rawOffset) && rawOffset > 0 ? Math.floor(rawOffset) : 0;

  const rawStatus = (params.get('status') || '').trim().toLowerCase();
  const status = (TENANT_STATUSES as readonly string[]).includes(rawStatus)
    ? (rawStatus as TenantStatus)
    : null;

  const q = (params.get('q') || '').trim() || null;

  return { limit, offset, status, q };
}

/** Escape regex metacharacters so a search term is matched literally, never as a pattern. */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Build the mongoose filter for a listing query. Status (when set) is an exact match; the
 * search term (when set) is a case-insensitive substring across slug / name / customDomain.
 * PURE: returns a plain filter object, no DB access.
 */
export function buildTenantQueryFilter(query: Pick<AdminTenantQuery, 'status' | 'q'>): Record<string, unknown> {
  const filter: Record<string, unknown> = {};
  if (query.status) filter.status = query.status;
  if (query.q) {
    const rx = new RegExp(escapeRegex(query.q), 'i');
    filter.$or = [{ slug: rx }, { name: rx }, { customDomain: rx }];
  }
  return filter;
}

/** Project one Tenant doc to the display-safe superadmin summary (no secrets, dates → ISO). */
export function summarizeTenant(doc: TenantDoc): TenantSummary {
  const d = doc as TenantDoc & {
    aiByoKey?: boolean;
    billingCustomerId?: string | null;
    billingSubscriptionId?: string | null;
    customDomain?: string | null;
    trialEndsAt?: unknown;
    erasureScheduledAt?: unknown;
    createdAt?: unknown;
    updatedAt?: unknown;
  };
  return {
    id: String(d._id),
    slug: String(d.slug ?? ''),
    name: String(d.name ?? ''),
    plan: String(d.plan ?? ''),
    status: String(d.status ?? ''),
    tier: String(d.tier ?? ''),
    customDomain: d.customDomain ? String(d.customDomain) : null,
    trialEndsAt: iso(d.trialEndsAt),
    erasureScheduledAt: iso(d.erasureScheduledAt),
    billingLinked: Boolean(d.billingCustomerId || d.billingSubscriptionId),
    aiByoKey: Boolean(d.aiByoKey),
    createdAt: iso(d.createdAt),
    updatedAt: iso(d.updatedAt),
  };
}

export type AdminTenantListing = {
  format: 'pharos.admin-tenant-listing';
  version: 1;
  generatedAt: string;
  total: number;
  count: number;
  limit: number;
  offset: number;
  filter: { status: TenantStatus | null; q: string | null };
  tenants: TenantSummary[];
};

/** Assemble the stable listing envelope. PURE: totals/count derived, never trusted blindly. */
export function buildTenantListing(
  summaries: TenantSummary[],
  meta: { total: number; query: AdminTenantQuery; generatedAt: Date }
): AdminTenantListing {
  const gen =
    meta.generatedAt instanceof Date && !Number.isNaN(meta.generatedAt.getTime())
      ? meta.generatedAt
      : new Date(0);
  const total = Number.isFinite(meta.total) && meta.total >= 0 ? Math.floor(meta.total) : 0;
  return {
    format: 'pharos.admin-tenant-listing',
    version: 1,
    generatedAt: gen.toISOString(),
    total,
    count: summaries.length,
    limit: meta.query.limit,
    offset: meta.query.offset,
    filter: { status: meta.query.status, q: meta.query.q },
    tenants: summaries,
  };
}

/**
 * READ-ONLY registry query: total matching count + one page of Tenant summaries, newest
 * first. The only impure function here. Never touches a per-tenant data database.
 */
export async function listTenantsForAdmin(
  query: AdminTenantQuery
): Promise<{ summaries: TenantSummary[]; total: number }> {
  await connectDB();
  const filter = buildTenantQueryFilter(query);
  const total = await Tenant.countDocuments(filter);
  const docs = (await Tenant.find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .skip(query.offset)
    .limit(query.limit)
    .lean()) as unknown as TenantDoc[];
  return { summaries: docs.map(summarizeTenant), total };
}
