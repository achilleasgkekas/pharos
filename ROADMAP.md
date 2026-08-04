# PHAROS — Product Roadmap

> Living document. We brain-dump here, then prioritise. Nothing below is committed
> work yet; it is the shared map for turning the self-hosted app into a product.
> Last updated: 2026-06-23.

## 0. The three editions

| Edition | Who | Storage | Auth | Billing |
|---|---|---|---|---|
| **Self-hosted (free/OSS or source-available)** | power users, on their own box | their disk + their OneDrive/SMB/FTP | local users | none |
| **Self-hosted (licensed)** | businesses wanting support/updates | theirs | local users | license key |
| **SaaS (our infra)** | everyone, low-friction | our managed bucket (+ optional bring-your-own) | email + MFA, multi-tenant | Stripe, plans, 5 GB free |

The codebase is shared. The **single biggest divider is multi-tenancy** (§C).

## 1. Current state (verified in code, 2026-06-23)

- **API:** `/api/mcp` (JSON-RPC, per-user `apiToken` Bearer, `tools/list` + `tools/call` over the AI tool registry) and `/api/files` (serves bytes from **local** disk, inline). The web UI uses Next.js **server actions** (RPC), not consumable by a native app.
- **Auth:** `User { passwordHash (scrypt), role: admin|member, apiToken }`. No email, no MFA, no tenant, no plan/quota. Admin-created users, single tenant.
- **Storage:** local-first. `/api/files` reads local; OneDrive is **push-only** (`uploadToOnedrive`, no download, no share-link). SMB/FTP/OneDrive are backup mirrors.
- **Notifications:** ntfy (outbound, one channel).
- **Docker:** `web` builds locally (`build:`), **not published**. CI (`ci.yml`) only type-checks + builds — no image push.
- **i18n:** 8 languages, most pages done (Items/Receipts/Settings pending). Cookie-based.

## 2. Workstreams

### A. Public REST API
- **Goal:** versioned `/api/v1/...` (token auth) for full CRUD, so a browser extension + Discord/Telegram bots + 3rd parties consume one stable surface. (No mobile app — discontinued 2026-08-04, see `OWNER_DECISIONS.md` #15.)
- **Have:** MCP tool endpoint (good seed; reuse `aiTools.ts` `execute()`), token auth pattern.
- **Need:** REST resources (`receipts`, `items`, `expenses`, `statements`, `subscriptions`, `vouchers`, `tasks`), pagination, errors, OpenAPI spec, rate-limit, token scopes.
- **Size:** Medium. **Useful even if SaaS never happens** (decouples UI/backend, unlocks integrations).

### B. Distribution (no git pull)
- **Goal:** customers run a **published image**, not source.
- **Need:** CI builds + pushes `pharos:vX.Y.Z` + `:latest` to **Docker Hub or GHCR**; ship a `docker-compose.prod.yml` referencing `image:` instead of `build:`; tagging/versioning; `docker compose pull && up`.
- **Decision:** registry (Docker Hub vs GHCR) + **license model** (MIT/Apache vs source-available/BSL vs closed). Affects whether the image is public.
- **Size:** **Small. Easiest first win.**

### C. Multi-tenancy (the divider) — model: **database-per-tenant**
**Decision (Achilleas):** each tenant gets its **own database**, not a shared collection with `tenantId`. Tiers:
- **Shared:** own DB on a **shared MongoDB cluster**. Cheaper. **DB-size quota** (fill up to a limit, then upgrade).
- **Dedicated:** own MongoDB instance/cluster + dedicated app resources + **custom domain**. Pricier.

- **Mechanism:** one cluster connection + `mongoose conn.useDb('tenant_<id>')` per request (shares the pool, cheap, strong logical isolation); a **tenant resolver** maps host/subdomain/custom-domain/session → tenant → DB; models registered per-connection. Today `lib/db.ts` is a single cached connection — this becomes a per-tenant connection/`useDb` layer.
- **Need:** resolver, per-tenant config (storage backend, AI keys, plan, limits), `dbStats()` size metering + enforcement, per-tenant **backup/restore/export/delete** (DB-per-tenant makes these clean), migrations that run across **all** tenant DBs, superadmin console.
- **Honest caveat:** DB-per-tenant = great isolation + clean per-tenant backup/quota, but MongoDB has a **per-cluster DB/collection ceiling** (Atlas ~ low thousands). Fine to start; if the free tier ever reaches tens of thousands of tenants, that tier might need pooled-schema while paid stays DB-per-tenant. The resolver hides which model a tenant uses, so decide later.
- **Size:** **Large. Touches the whole data layer + every model.** Prereq for SaaS.

### D. Accounts & auth (web product grade)
- **Have:** passwordHash + role + apiToken.
- **Need:** email field + **email verification**, password reset, **MFA (TOTP + recovery codes)**, session management, org/team + invites + roles, optional SSO/OAuth (Google/Microsoft) later.
- **Size:** Medium-Large.

### E. Billing, plans, quotas
- **Need:** Stripe (subscriptions, invoices, **EU VAT**), plan definitions, **storage quota (5 GB free)** = sum of stored bytes per tenant, enforced on upload, soft/hard limits + upgrade prompts; **AI usage metering** (§H); dunning, trials, proration.
- **Size:** Large.

### F. Storage (per-location + URLs)
- **Self-hosted:** keep local-first; optional toggle "expose my storage URLs" (OneDrive share-link / S3) for users who want direct links.
- **SaaS:** serve via **our** app URLs behind auth; issue **signed/expiring URLs** for direct download/bandwidth offload; **never** raw storage links. `/api/files` becomes **backend-aware per tenant** (their OneDrive/S3 or our managed bucket).
- **Backends:** today local/SMB/FTP/OneDrive (push-only). Add **Amazon S3, Azure Blob, Cloudflare R2** as first-class, **tenant-selectable** backends behind the existing storage abstraction (each is "just another driver"). SaaS default = our managed bucket; higher tiers may bring-your-own (their S3/Azure).
- **Need:** a real download/cache path (OneDrive currently has no GET), managed bucket (S3/R2/Azure), per-tenant quota accounting (ties to §E).
- **Size:** Medium-Large.

### G. Integrations — inbound + outbound
**Key insight:** the MCP **tool registry already is** the substrate. A Discord/Telegram bot = link account → receive message → call the same `execute()` tools. Bots + API + browser extension all share it.
- **Inbound (add + ask):** Discord bot, Telegram bot, email-in (forward a receipt), maybe WhatsApp. "add expense ΔΕΗ 84€", "show this month" → routes to AI tools. Each AI message **meters + charges** (§H). Needs per-user account linking + a webhook ingest service per platform.
- **Outbound (notifications):** generalise the single ntfy into a **pluggable notifier**: ntfy, Discord webhook, Telegram, Slack, email, generic webhook. Per-user channel config + event types (price drop, installment due, warranty expiring, renewal).
- **Size:** Medium per channel; the framework is the work, channels are cheap after.

### H. AI metering & billing
- **Goal:** every AI call (receipt scan, command, bot question) is **metered per tenant**; plans include quotas; overage billed or blocked.
- **Need:** usage ledger (tokens/calls/cost per tenant), limits + cutoffs, "you've used X of Y", BYO-key option (tenant uses own Anthropic key = no AI charge), cost guard (already have a bulk-AI confirm).
- **Size:** Medium.

### I. Docs / Knowledge base / manuals
- **Need:** help center (getting started, self-host guide, API docs/OpenAPI, integrations, billing FAQ), in-app contextual help/tooltips, changelog. Likely a docs site (Docusaurus/Mintlify/Nextra) + in-app links.
- **Size:** Medium (ongoing).

### J. Legal & compliance (handling third-party financial data = high duty)
- **Need:** ToS, Privacy Policy, **GDPR** (lawful basis, DPA for customers, sub-processor list, data export + delete/"right to be forgotten", breach process), **data residency** (EU region), cookie/consent. Get a lawyer for the templates.
- **Size:** Medium (mostly non-code) but **blocking for SaaS launch**.

### K. Security
- **Need:** **encryption at rest** (DB + file storage; consider per-tenant keys for stored documents), TLS everywhere, secrets management, audit log, rate-limiting + abuse protection, dependency/CVE scanning, pen-test before SaaS launch, backup encryption. Files are receipts/statements = sensitive.
- **Size:** Medium-Large, continuous.

### L. Ops
- **Need:** per-tenant backup + DR, observability (logs/metrics/traces, error tracking), uptime/status page, on-call/support workflow, staging env, blue-green deploys.
- **Size:** Medium-Large, continuous.

### M. Marketing site
- **Need:** landing, pricing, features, signup flow, docs link, trust/security page.
- **Size:** Medium.

## 3. Phased plan (dependency-ordered)

- **Phase 0 — useful no matter what (start here):**
  1. **Publish image to a registry via CI** (§B) — unblocks "no git pull" immediately.
  2. **`/api/v1` REST seed** (§A) — unlocks bots/integrations + decouples UI.
- **Phase 1 — self-hosted as a product:** license (§B), docs/KB v1 (§I), "expose storage URLs" toggle (§F), polished prod compose + `.env`.
- **Phase 2 — SaaS foundation:** multi-tenancy (§C) → accounts+MFA (§D) → managed storage + signed URLs + quota (§F) → AI metering (§H).
- **Phase 3 — SaaS launch:** billing/plans (§E), inbound+outbound integrations (§G), encryption hardening (§K), legal (§J), ops (§L), marketing (§M).

## 4. Open decisions (need your call before we go deep)

1. **License:** OSS (MIT/Apache) vs source-available (BSL) vs closed? Drives §B and the registry's visibility.
2. **Registry:** Docker Hub vs GHCR.
3. **Billing provider:** Stripe (assumed) vs Paddle (Paddle handles EU VAT/merchant-of-record for you).
4. **Managed storage:** S3 vs Cloudflare R2 (R2 = no egress fees) vs your own.
5. **Data residency:** EU-only region?
6. **First chat platforms:** Telegram (easiest) and/or Discord first?
7. **AI billing model:** included quota + overage, or BYO-key (tenant pays Anthropic directly)?
8. **Encryption scope:** at-rest only, or per-tenant document keys (stronger, more complex)?
9. **Tenant DB model confirmation:** DB-per-tenant for shared + instance-per-tenant for dedicated (current plan, §C) — confirm, and pick the cluster (Atlas vs self-managed).
10. **Custom domain (dedicated/top tier):** TLS strategy — wildcard `*.pharos.app` for subdomains + **on-demand certs** for customer domains (Caddy on-demand TLS, or Cloudflare for SaaS / Cloudflare Custom Hostnames). Domain → tenant mapping table.
11. **Tiers & limits:** define the ladder (free 5 GB shared → paid shared bigger DB → dedicated + custom domain), and the DB-size thresholds that force an upgrade.

## 5. Parked / in-flight (not product-roadmap but tracked)
- i18n rollout: Items / Receipts / Settings pages remaining.
- AI-search-open redesign: 4 concepts proposed (Beacon Sweep / Glass Console / Aurora Veil / Warp Dock), awaiting pick.
- In-app notification center (the outbound notifier framework in §G supersedes/extends this).
