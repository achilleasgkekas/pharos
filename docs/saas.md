# Managed SaaS mode

Pharos ships in two shapes from one codebase:

- **Self-hosted** (open source, AGPL-3.0) — the default. One implicit owner, one
  database, everything unlocked. This is what the rest of the docs describe, and
  nothing on this page applies unless you turn SaaS mode on.
- **Managed SaaS** — a multi-tenant control plane (accounts, workspaces,
  memberships, billing) layered on top of the same feature code. Each workspace
  gets its own data database; access, seats, and quotas are gated per plan.

This page documents the SaaS layer: how to enable it, the tenancy model, the
plan ladder, the control-plane API, and the extra environment it needs. It is
useful if you want to run your own hosted Pharos, or to understand how the hosted
service is organised.

> **OSS parity is a hard rule.** The self-hosted app is never gated by the SaaS
> layer. It runs as an implicit `dedicated` tenant with every feature and no
> quota. SaaS differentiates only on **capacity** (storage + AI call volume),
> **seats**, **custom domain**, and **isolation tier**, never by locking feature
> pages behind a paywall.

## Enabling SaaS mode

SaaS mode is a single feature flag, off by default:

| Variable | Values | Meaning |
| --- | --- | --- |
| `SAAS_MODE` | `on` / `1` / `true` / `yes` → on; anything else → off | Master switch for the whole multi-tenant control plane. Unset = self-hosted. |

When `SAAS_MODE` is off:

- Every `/api/saas/**` endpoint returns **404** (they do not exist for the
  self-hosted app).
- The tenant resolver always returns the frozen `DEFAULT_TENANT` with **zero**
  database access, so the single-user app keeps working with no extra config.

Turning it on activates account signup/login, workspace provisioning, member
management, invitations, usage metering, and Stripe billing.

## Tenancy model

Three control-plane concepts sit above the existing per-feature data:

- **Account** — a global identity (email + scrypt-hashed password). One person,
  one account, regardless of how many workspaces they belong to.
- **Tenant (workspace)** — an isolated Pharos instance. Its feature data (items,
  receipts, statements, …) lives in its **own database** (`dbName`); isolation
  happens at the connection level, not with a `tenantId` filter on every query.
- **Membership** — links an account to a tenant with a role. This is where seats
  and permissions live.

Requests resolve to a tenant by **subdomain** (`<slug>.ph-aros.com`), by **custom
domain** (dedicated tier), or by an explicit slug from the session. Reserved
labels (`www`, `app`, `api`, `admin`, …) and the apex never resolve to a tenant.

### Roles

Memberships carry one of three org roles:

| Role | Can manage members | Notes |
| --- | --- | --- |
| `owner` | yes | Only an owner may assign the `owner` role. A workspace can never be left with zero active owners. |
| `admin` | yes | Manage members and invites, but cannot mint new owners. |
| `member` | no | Read-only for control-plane surfaces (e.g. billing shows read-only with `action: 'view'`). |

## Plans and quotas

The plan ladder is the single source of truth for pricing tiers and quotas
(`apps/web/src/lib/billing/plans.ts`). Prices are display values; the real charge
lives in Stripe. Numbers below are current placeholders and may change.

| Plan | Price/mo | Tier | Storage | AI calls/mo | Seats | Custom domain |
| --- | --- | --- | --- | --- | --- | --- |
| **Free** | €0 | shared | 5 GB | 50 | 1 | no |
| **Pro** (`shared`) | €9 | shared | 50 GB | 1000 | 5 | no |
| **Dedicated** | €29 | dedicated | 500 GB | unlimited (BYO-key) | unlimited | yes |

Quota enforcement:

- **Seats** — the members route refuses to add a seat past `maxMembers`
  (`withinSeatLimit`). Unlimited plans always pass.
- **AI volume** — metered per billing month against `aiCallsPerMonth`
  (`withinAiQuota`); `null` = unlimited.
- **Storage** — metered against the plan's byte allowance (`withinStorage`).
- **Features** — every plan gets the full AI feature set; the value ladder is
  volume + capacity + isolation, not feature locks.

## Workspace lifecycle

A tenant carries a lifecycle `status` that gates access independently of its
plan. The five states are:

| Status | Meaning | Access |
| --- | --- | --- |
| `pending` | Provisioned but not yet activated. | Blocked. |
| `trialing` | In its free trial window (the default at signup). | Full. |
| `active` | Paid subscription in good standing. | Full. |
| `suspended` | A recoverable dunning hold (trial lapsed, or billing failed). | Blocked; an owner clears it by resolving billing. |
| `canceled` | Owner-initiated soft delete. | Blocked. |

New workspaces start as `trialing` with a bounded end instant
(`trialEndsAt = createdAt + trial days`; the default trial length is a
placeholder of **14 days** in `lib/billing/trial.ts`). A read surface can tell
the UI "N days left" or "trial expired" from that end.

### Trial dunning and lapse sweep

An expired trial does not silently keep full access. A scheduler-driven sweep
(`runTrialLapseSweep`, also reachable via the endpoint below) runs two ordered
passes:

1. **Warn** — trialing tenants whose bounded trial ends within
   `WARN_BEFORE_DAYS` (**3**) receive exactly one idempotent dunning email. The
   send is stamped (`trialWarnEmailedAt`) so a tenant is never warned twice, and
   the pass is skipped entirely when no mail channel is configured.
2. **Suspend** — trialing tenants whose `trialEndsAt` has already passed
   transition to `suspended` (a recoverable hold, not `canceled`). The owner
   reactivates by adding billing.

The warn window and the lapse instant are mutually exclusive, so a tenant is
never warned and suspended in the same run. Open-ended trials (a legacy tenant
with no `trialEndsAt`) are treated as still-active and never auto-suspended.

An in-process 6-hourly cron calls the same runner; the route below is the
on-demand / external trigger.

| Method | Path | Auth | Result |
| --- | --- | --- | --- |
| `POST` | `/api/saas/trials/sweep` | `Bearer <CRON_SECRET>` | Runs the warn + suspend sweep. `{ ok, warned, warnFailed, ... }`. `404` when SaaS off, `500` if `CRON_SECRET` unset, `401` on a bad token. Writes only the control-plane `Tenant`/`AuditEvent` collections; the data plane is untouched. |

## Bring-your-own-key AI (secret-at-rest)

On the Dedicated tier a workspace can supply **its own** AI provider key (BYO-key)
instead of drawing on the platform's metered AI quota. Because that key is a
third-party secret, it is encrypted at rest rather than stored in plaintext.

- **Cipher** — AES-256-GCM (authenticated, so tampering is detected). Stored as a
  self-describing `gcm1$<iv>$<tag>$<ciphertext>` envelope (all parts base64) with
  a fresh random 12-byte IV per encryption, so encrypting the same key twice
  yields different ciphertexts (`lib/tenancy/secretCrypto.ts`).
- **Key derivation** — the 32-byte encryption key is derived from the existing
  `AUTH_SECRET` via scrypt with a fixed domain-separation salt (no new dependency,
  no new secret to manage). Rotating `AUTH_SECRET` re-derives the key and makes
  existing ciphertexts undecryptable, so treat it as stable.
- **Fail-closed** — without a real `AUTH_SECRET` (min 16 chars) the codec refuses
  to encrypt or decrypt. Decryption returns `null` on any failure (malformed
  envelope, wrong secret, tampered ciphertext) rather than throwing; the caller
  treats `null` as "no usable key".
- **Supported providers** — `anthropic`, `openai`, `gemini`, `openrouter`,
  `custom` (`lib/billing/byoKey.ts`). The stored record is
  `{ provider, keyEnc }`; it is decrypted on-demand in memory at the AI call site
  and never logged. Settings UIs read a masked preview (`••••<last 4>`), never the
  plaintext.

> **OSS parity.** Only the SaaS BYO-key path uses this. The self-hosted app keeps
> its single-owner provider key in `AppConfig` (unencrypted, one trusted box), so
> the crypto layer is never on its path.

## Control-plane API (`/api/saas/**`)

All routes below exist **only** when `SAAS_MODE` is on (404 otherwise) and are
completely separate from the self-hosted bearer-token API in
[api.md](api.md). Authentication here is a **session cookie** set at
signup/login, not a bearer token.

### Authentication

| Method | Path | Body | Result |
| --- | --- | --- | --- |
| `POST` | `/api/saas/auth/signup` | `{ email, password, name?, workspace? }` | Creates a global account (password ≥ 8 chars), provisions a first workspace with an owner membership, sets the session cookie. `201 { account, tenants }`. `409` if the email exists. |
| `POST` | `/api/saas/auth/login` | `{ email, password }` | Verifies the password, sets the session cookie. `200 { account, tenants }`. Wrong email and wrong password both return the same `401` (no account enumeration). |
| `POST` | `/api/saas/auth/logout` | — | Clears the session cookie. Idempotent `200 { ok: true }`. |
| `GET` | `/api/saas/auth/session` | — | `{ account, tenants }` when signed in, or `{ account: null }` when logged out or the account no longer exists. |

### Account profile

| Method | Path | Body | Result |
| --- | --- | --- | --- |
| `GET` | `/api/saas/account` | — | The caller's own profile: `{ account: { id, email, name, emailVerified, lastLoginAt, createdAt } }`. |
| `PATCH` | `/api/saas/account` | `{ name?, email? }` | Update display name and/or email. `409` if the new email is taken. |

Additional account routes exist for email verification
(`/api/saas/account/verify/request`, `/verify/confirm`), password reset
(`/api/saas/account/reset/request`, `/reset/confirm`), and password change
(`/api/saas/account/password`).

### Members and invitations

`/api/saas/members` manages a workspace's roster. Gating: 404 when SaaS off, 401
when signed out, 403 when not a member (GET) or not an owner/admin (write).

| Method | Path | Body | Result |
| --- | --- | --- | --- |
| `GET` | `/api/saas/members` | — | Roster of memberships joined to account email/name, plus pending invites. |
| `POST` | `/api/saas/members` | `{ email, role }` | Add a member. If an account exists, mints an active membership (subject to the seat limit → `409`). If not, **mints an invitation** and emails an accept link. Only an owner may assign `owner`. |
| `PATCH` | `/api/saas/members` | `{ accountId, role }` | Change a member's role. Cannot orphan the last owner. |
| `DELETE` | `/api/saas/members` | `{ accountId }` | Remove a member. Cannot remove the last active owner. |

Redeeming an invite:

| Method | Path | Body | Result |
| --- | --- | --- | --- |
| `POST` | `/api/saas/invites/accept` | `{ token, password?, name? }` | Unauthenticated by design. Looks the token up by hash; if valid (pending + unexpired) creates or reuses the invited account, mints an active membership with the invited role, marks the invite accepted, and logs the account in. `password` is required only when no account exists yet. `410` for an invalid/expired token. |

### Billing (Stripe)

| Method | Path | Query/Body | Result |
| --- | --- | --- | --- |
| `GET` | `/api/saas/billing` | `?tenant=<slug>` | Read-only billing summary for a workspace: plan, lifecycle status, Stripe linkage, whether billing is configured, and the CTA to render (`subscribe` / `manage` / `view`). Open to any member; non-managers get `canManage:false` + `action:'view'`. |
| `POST` | `/api/saas/billing/checkout` | `{ plan }` | Start a Stripe Checkout session for a paid plan (`shared` or `dedicated`). Returns `{ url, id }`. Upstream Stripe errors → `502`. |
| `POST` | `/api/saas/billing/portal` | — | Open the Stripe customer portal for the workspace. |
| `POST` | `/api/saas/billing/webhook` | Stripe event | Webhook receiver. Maps `checkout.session.completed` and `customer.subscription.{created,updated,deleted}` onto `Tenant.status`/`plan`. Always returns `200` on handled/ignored events so Stripe stops retrying. |

### Usage

| Method | Path | Query | Result |
| --- | --- | --- | --- |
| `GET` | `/api/saas/usage` | `?tenant=<slug>` | Current-period usage + quota status for a workspace: `{ tenant, period, usage: { aiCalls, storageBytes, metered }, quotas: { ai, storage } }`. Consumed by a billing/usage dashboard. |

There is also a metering sample endpoint at `/api/saas/usage/sample`.

## SaaS environment variables

These are needed **only** in SaaS mode. Use placeholders; never commit real
secrets. They are not part of the self-hosted `.env.example` yet
(TODO: add a documented SaaS block there).

| Variable | Purpose |
| --- | --- |
| `SAAS_MODE` | Master switch (see above). |
| `SAAS_BASE_DOMAIN` | Base domain for tenant subdomains (`<slug>.<domain>`). Defaults to `ph-aros.com`; override for localhost/staging. |
| `SAAS_SESSION_IDLE_HOURS` | Idle lifetime for the account session cookie. |
| `AUTH_SECRET` | Shared secret used to sign session cookies (also required by the self-hosted app) and to derive the AES-256-GCM key that encrypts BYO-key AI secrets at rest. Rotating it invalidates existing encrypted keys, so keep it stable. |
| `AUTH_COOKIE_SECURE` | Force the `Secure` flag on cookies (behind HTTPS). |
| `STRIPE_SECRET_KEY` | Stripe secret key. When unset, billing reports "not configured" and checkout/portal are unavailable. |
| `STRIPE_WEBHOOK_SECRET` | Verifies incoming Stripe webhook signatures. |
| `CRON_SECRET` | Bearer token guarding scheduler-driven routes (e.g. the trial-lapse sweep). Required for those endpoints; when unset they fail closed with `500`. |
| `STRIPE_PRICE_SHARED` | Stripe Price ID for the Pro (`shared`) plan. |
| `STRIPE_PRICE_DEDICATED` | Stripe Price ID for the Dedicated plan. |
| `RESEND_API_KEY` | Enables transactional email (invites, verification, reset) via Resend. |
| `SMTP_URL` | Alternative mailer transport when Resend is not set. |
| `MAIL_FROM` | From address for outbound email. Defaults to `Pharos <no-reply@ph-aros.com>`. |

When neither `RESEND_API_KEY` nor `SMTP_URL` is set, the mailer cannot deliver;
in non-production it logs the message instead of sending, so invite/reset flows
still work locally.

## See also

- [Docs index](README.md)
- [Self-hosting](self-hosting.md) — running the open-source single-tenant app.
- [Configuration](configuration.md) — AI providers, storage, notifications, i18n.
- [API reference](api.md) — the self-hosted bearer-token REST API (`/api/v1`),
  distinct from the cookie-based control-plane API above.
