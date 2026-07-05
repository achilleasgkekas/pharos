// GDPR account data-export — the machine-readable copy of the personal data tied to one
// SaaS `Account` (GDPR Art. 15 right of access + Art. 20 data portability). PURE + SaaS-only.
//
// This assembles ONLY the control-plane personal data the platform holds about the login
// identity: the account profile and its workspace memberships. It deliberately does NOT
// include workspace CONTENT (Items, Receipts, …) — that lives in each tenant's isolated data
// database and is exported per-workspace (TODO §8 "Per-tenant … export"). Secrets (passwordHash,
// verify/reset tokens) are never read here: the assembler only projects whitelisted fields, so
// by construction a stray secret column can never leak into the export.
//
// The whole module is a pure function with no DB/import side effects, so it is fully
// unit-testable and client-safe. The route handler does the (node-only) DB reads and hands the
// lean docs in.

/** ISO-8601, or null for a missing/invalid date. Local so the module stays dependency-free. */
function iso(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  const t = d instanceof Date ? d : new Date(d);
  return Number.isNaN(t.getTime()) ? null : t.toISOString();
}

/** The whitelisted fields the assembler reads off a lean Account doc. */
export type ExportAccountInput = {
  _id: unknown;
  email?: string;
  name?: string;
  emailVerified?: boolean;
  lastLoginAt?: Date | string | null;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
};

/** One membership joined to its tenant's display fields (the route does the join). */
export type ExportMembershipInput = {
  role?: string;
  status?: string;
  createdAt?: Date | string | null;
  tenant?: { slug?: string; name?: string; plan?: string; status?: string } | null;
};

export type AccountExport = {
  format: 'pharos.account-export';
  version: 1;
  generatedAt: string;
  notice: string;
  account: {
    id: string;
    email: string;
    name: string;
    emailVerified: boolean;
    lastLoginAt: string | null;
    createdAt: string | null;
    updatedAt: string | null;
  };
  memberships: Array<{
    tenantSlug: string;
    tenantName: string;
    plan: string;
    role: string;
    status: string;
    joinedAt: string | null;
  }>;
};

const EXPORT_NOTICE =
  'This is a copy of the personal data associated with your Pharos account (GDPR Art. 15/20). ' +
  'It covers your login identity and workspace memberships only; workspace content lives in each ' +
  "workspace's own database and is exported separately per workspace.";

/**
 * Build the GDPR data-access export for one account. Pure: pass the lean account doc, its
 * memberships (each already joined to its tenant's display fields), and the generation time.
 * A membership whose tenant could not be resolved (deleted mid-export) is skipped rather than
 * emitting blank rows. Only whitelisted, non-secret fields are ever projected.
 */
export function buildAccountExport(
  account: ExportAccountInput,
  memberships: readonly ExportMembershipInput[],
  generatedAt: Date | string
): AccountExport {
  const rows: AccountExport['memberships'] = [];
  for (const m of memberships) {
    if (!m || !m.tenant || !m.tenant.slug) continue; // unresolvable tenant → skip
    rows.push({
      tenantSlug: m.tenant.slug,
      tenantName: m.tenant.name || m.tenant.slug,
      plan: m.tenant.plan || '',
      role: m.role || '',
      status: m.status || '',
      joinedAt: iso(m.createdAt),
    });
  }
  return {
    format: 'pharos.account-export',
    version: 1,
    generatedAt: iso(generatedAt) ?? new Date(0).toISOString(),
    notice: EXPORT_NOTICE,
    account: {
      id: String(account._id),
      email: account.email || '',
      name: account.name || '',
      emailVerified: !!account.emailVerified,
      lastLoginAt: iso(account.lastLoginAt),
      createdAt: iso(account.createdAt),
      updatedAt: iso(account.updatedAt),
    },
    memberships: rows,
  };
}

/**
 * Content-Disposition filename for the download. Derives from the account id (a hex ObjectId,
 * so already filesystem-safe); still stripped defensively to a safe charset.
 */
export function accountExportFilename(accountId: string): string {
  const safe = String(accountId).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) || 'account';
  return `pharos-account-${safe}.json`;
}
