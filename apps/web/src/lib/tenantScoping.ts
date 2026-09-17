/**
 * TENANT-SCOPING AUDIT REGISTRY — the allowlist behind `tenantScoping.test.ts`.
 *
 * WHY THIS EXISTS. In SaaS mode every workspace lives in its OWN database; a request is
 * routed to it by wrapping model access in a scoping idiom that resolves the current
 * tenant's connection:
 *
 *     const Receipt = await currentModel(ReceiptModel);   // most call sites
 *     const Config  = tenantModel(await tenantDb(ctx), AppConfig);   // ambient/edge paths
 *     withRequestTenant(() => …)                            // wraps a whole handler
 *
 * A model touched WITHOUT one of those idioms reads/writes the base (registry) database
 * instead of the workspace's. For per-workspace data that is a cross-tenant leak or a
 * silent no-op; the failure is invisible until a real tenant hits it. The bug is exactly
 * the kind that creeps in one new action at a time, so — mirroring `backupModels.ts` —
 * the guard test makes omission LOUD: every file that touches a Mongoose collection
 * method without a scoping idiom must be listed here WITH a reason, or the suite fails.
 * Adding such a file forces a conscious "is this really allowed to skip tenant scoping?"
 *
 * The three reasons a file legitimately skips scoping, and nothing else:
 *   1. SaaS CONTROL PLANE — Account/Tenant/Membership/Invite/Usage/AuditEvent and the
 *      admin/billing surfaces live in the central registry DB by design; they are not any
 *      one workspace's data, so they must NOT be routed to a tenant connection.
 *   2. PRE-TENANT / USER IDENTITY — login, first-run setup, and the self-host `User`
 *      account (calendar/API tokens, MFA) run before or beside any tenant context; `User`
 *      is a base-connection identity, not per-workspace content.
 *   3. GLOBAL-BY-DESIGN / SELF-HOST-ONLY — a shared cache or an in-process worker that is
 *      deliberately one global collection, or a helper that no-ops under `saasMode()`.
 *
 * SCOPE / KNOWN LIMITATION. This is a FILE-level guard: it catches a brand-new file that
 * touches a model with no scoping idiom anywhere in it (the common drift). It does NOT
 * catch a PARTIAL bypass — a single raw `ItemModel.find(...)` added inside a file that
 * already scopes elsewhere — because at file granularity that file looks scoped. Those are
 * rarer and more visible in review; tightening to call-site granularity is future work
 * (see PROGRESS / WEB_DEBT). Audited read-only on 2026-09-06: no genuine bypass found —
 * every entry below is one of the three legitimate reasons.
 */

/**
 * Files permitted to touch a Mongoose model without a per-request tenant-scoping idiom,
 * each mapped to the reason. Paths are relative to `apps/web/src`.
 */
export const SCOPING_EXEMPT_FILES: Record<string, string> = {
  // — 1. SaaS control plane: central registry DB, never a tenant connection —
  'app/api/saas/account/export/route.ts': 'Control plane: Account self-service data export (registry DB).',
  'app/api/saas/account/mfa/route.ts': 'Control plane: Account MFA enrolment (registry DB).',
  'app/api/saas/account/password/route.ts': 'Control plane: Account password change (registry DB).',
  'app/api/saas/account/reset/confirm/route.ts': 'Control plane: Account password-reset confirm (registry DB).',
  'app/api/saas/account/reset/request/route.ts': 'Control plane: Account password-reset request (registry DB).',
  'app/api/saas/account/route.ts': 'Control plane: Account profile read/update (registry DB).',
  'app/api/saas/account/verify/confirm/route.ts': 'Control plane: Account email-verify confirm (registry DB).',
  'app/api/saas/account/verify/request/route.ts': 'Control plane: Account email-verify request (registry DB).',
  'app/api/saas/account/workspaces/route.ts': 'Control plane: lists an Account\'s Memberships/Tenants (registry DB).',
  'app/api/saas/admin/tenants/[slug]/route.ts': 'Control plane: superadmin tenant admin (registry DB).',
  'app/api/saas/audit/route.ts': 'Control plane: AuditEvent security log (registry DB).',
  'app/api/saas/auth/login/route.ts': 'Control plane: Account login (registry DB).',
  'app/api/saas/auth/mfa/route.ts': 'Control plane: Account login MFA step (registry DB).',
  'app/api/saas/auth/session/route.ts': 'Control plane: Account session read (registry DB).',
  'app/api/saas/auth/signup/route.ts': 'Control plane: Account signup + first Tenant (registry DB).',
  'app/api/saas/billing/activate/route.ts': 'Control plane: subscription activation (registry DB).',
  'app/api/saas/billing/route.ts': 'Control plane: billing/subscription state (registry DB).',
  'app/api/saas/billing/webhook/route.ts': 'Control plane: Stripe webhook → Tenant/Usage (registry DB).',
  'app/api/saas/invites/accept/route.ts': 'Control plane: Invite acceptance → Membership (registry DB).',
  'app/api/saas/invites/resend/route.ts': 'Control plane: Invite resend (registry DB).',
  'app/api/saas/invites/route.ts': 'Control plane: Invite create/list (registry DB).',
  'app/api/saas/members/route.ts': 'Control plane: workspace Membership management (registry DB).',
  'app/api/saas/workspace/erasure/route.ts': 'Control plane: GDPR workspace erasure request (registry DB).',
  'app/api/saas/workspace/reactivate/route.ts': 'Control plane: workspace reactivation (registry DB).',
  'app/api/saas/workspace/route.ts': 'Control plane: Tenant/workspace settings (registry DB).',
  'lib/tenancy/adminAudit.ts': 'Control plane: AuditEvent reader for the admin console (registry DB).',
  'lib/tenancy/adminOverview.ts': 'Control plane: superadmin fleet overview (registry DB).',
  'lib/tenancy/adminTenantDbStats.ts': 'Control plane: per-tenant DB stats for the admin console (registry DB).',
  'lib/tenancy/adminTenantDetail.ts': 'Control plane: one tenant\'s admin detail (registry DB).',
  'lib/tenancy/adminTenantUsage.ts': 'Control plane: Usage metering readout (registry DB).',
  'lib/tenancy/adminTenants.ts': 'Control plane: Tenant list for the admin console (registry DB).',
  'lib/tenancy/deletionQueue.ts': 'Control plane: scheduled Tenant deletion queue (registry DB).',
  'lib/tenancy/mfaStore.ts': 'Control plane: Account MFA secret store (registry DB).',
  'lib/tenancy/provision.ts': 'Control plane: creates Tenant + Membership on provisioning (registry DB).',
  'lib/tenancy/saasApi.ts': 'Control plane: shared Account/Tenant/Membership data access (registry DB).',
  'lib/tenancy/superadmin.ts': 'Control plane: superadmin authz + reads (registry DB).',
  'lib/tenancy/superadminPage.ts': 'Control plane: superadmin page data (registry DB).',
  'lib/tenancy/workspaceSession.ts': 'Control plane: Account/workspace session resolution (registry DB).',
  'lib/billing/billingSession.ts': 'Control plane: billing session/Tenant lookup (registry DB).',
  'lib/billing/byoKeyStore.ts': 'Control plane: per-tenant BYO AI key on the Tenant record (registry DB).',
  'lib/billing/platformKeyStore.ts': 'Control plane: operator PlatformConfig AI key (registry DB).',
  'lib/billing/usage.ts': 'Control plane: Usage metering ledger (registry DB).',

  // — 2. Pre-tenant / self-host User identity (base-connection, not per-workspace data) —
  'app/login/actions.ts': 'Pre-tenant: self-host login runs before any tenant context; User is a base identity.',
  'app/setup/actions.ts': 'Pre-tenant: first-run setup creates the first User + AppConfig before tenancy exists.',
  'app/settings/users.actions.ts': 'User identity: self-host account management; User lives on the base connection.',
  'app/settings/calendarFeedActions.ts': 'User identity: sets the calendar-feed token on the User record.',
  'app/settings/mcpActions.ts': 'User identity: sets the MCP/API token on the User record.',
  'app/api/calendar.ics/route.ts': 'User identity, self-host only: resolves a User by calendar token; returns 404 in SaaS mode before any DB access (#121).',
  'lib/userMfaStore.ts': 'User identity: self-host User MFA secret store (base connection).',

  // — 3. Global-by-design / self-host-only (no per-tenant scoping applies) —
  'lib/scrapedPriceCache.ts': 'Global-by-design: ScrapedPrice is one shared cross-tenant price cache, deliberately not scoped.',
  'lib/jobRunner.ts': 'Global-by-design: the Job queue is one base-connection collection worked by a single in-process worker.',
  'app/settings/healthActions.ts': 'Reads the global Job queue for the health panel; the SaaS-specific checks are saasMode()-guarded.',
  'lib/aiBudget.ts': 'Self-host-only: the AI spend cap no-ops under saasMode(); on self-host default tenant = base connection.',
  'lib/cronHeartbeat.ts': 'Self-host-only: cron heartbeats are a self-host concept and no-op under saasMode().',
};

/** The scoping idioms that count as tenant-routing a model access. */
export const SCOPING_IDIOMS: readonly string[] = [
  'currentModel(',
  'scoped(',
  'withRequestTenant(',
  'tenantModel(',
  'tenantDb(',
];

/** Mongoose collection methods whose presence marks a real model access. */
export const MODEL_ACCESS_METHODS: readonly string[] = [
  'find',
  'findOne',
  'findById',
  'updateOne',
  'updateMany',
  'deleteOne',
  'deleteMany',
  'create',
  'insertMany',
  'countDocuments',
  'aggregate',
  'findOneAndUpdate',
  'findByIdAndUpdate',
  'bulkWrite',
];
