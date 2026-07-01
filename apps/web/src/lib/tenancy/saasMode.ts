// Single canonical reader for the SaaS multi-tenant feature flag.
//
// The app ships in TWO shapes from one codebase:
//   - self-hosted (open-source, AGPL): SAAS_MODE unset/off → today's single-user
//     behaviour, one implicit owner, the shared MONGO_URI database. Unchanged.
//   - managed SaaS: SAAS_MODE=on → multi-tenant control plane (accounts, tenants,
//     memberships, billing) gates access and resolves a per-tenant data database.
//
// EVERY piece of SaaS code must gate on this. Default (undefined) === off, so the
// existing single-user app keeps working with no config. This module has no imports
// so it is safe from any runtime (edge/node/client).
export function saasMode(): boolean {
  const v = (process.env.SAAS_MODE || '').trim().toLowerCase();
  return v === 'on' || v === '1' || v === 'true' || v === 'yes';
}
