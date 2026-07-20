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

#### Browser sign-in UI (`/account/login`, `/account/signup`)

The two pages above are the user-facing front-end for the auth API. They live in
a self-gating `(saas)` route segment: its layout calls `requireSaasUiEnabled()`,
which throws `notFound()` when `SAAS_MODE` is off or `AUTH_SECRET` is unset, so
the pages **do not exist** for the self-hosted build (the OSS app is unchanged).
The segment is `force-dynamic` and marked `noindex, nofollow`, and each page is
chrome-less (no `SiteNav`, since there is no per-tenant `User` session yet) —
each renders inside a shared `AuthShell` card.

| Route | Renders |
| --- | --- |
| `/account/login` | Email + password form. Posts to [`POST /api/saas/auth/login`](#authentication); on success does a **full** page navigation (not a client route change) to the sanitized `next` path so the fresh server render picks up the just-set httpOnly session cookie. Links to signup. |
| `/account/signup` | Dual-mode page serving two flows. **Normal signup:** email + password (≥ 8 chars) plus optional display name and workspace name; posts to [`POST /api/saas/auth/signup`](#authentication), which provisions a first workspace with an owner membership. **Invite acceptance:** if a `?invite=<token>` query param is present, the page server-renders an invite preview (invitee email and workspace name) and shows a lightweight `InviteAcceptForm` (confirm button + optionally set password if no account exists yet) instead. The form posts to [`POST /api/saas/invites/accept`](#invite-management) with the token. Invalid or expired invites show an "Invitation not available" message with fallback links to login/signup. A viewer already signed in to a different email is allowed to accept (the session switches to the invited account). Both flows redirect an already-signed-in viewer to `next` instead of showing a form. Links to login. |

Both pages redirect an **already-signed-in** viewer straight to `next` instead of
showing a form (this is also how a superadmin reaches `/admin`: sign in here,
then navigate). The `next` query param is always run through a `safeNextPath`
allow-list (same-origin relative paths only) before use, on both the page and the
form, so it cannot be turned into an open redirect. Client-side validation
(valid email, minimum password length) only shapes the UX — the API re-validates
authoritatively, and both wrong-email and wrong-password collapse to the same
`401` (no account enumeration).

#### Account settings UI (`/account/settings`)

Once signed in, the user can visit `/account/settings` to manage their account-level
settings: update profile (display name and email), change password, and download a
copy of their personal data for GDPR portability. The page is **account-scoped** (not
workspace-scoped), accessible from the account home (`/account`), and only available
when signed in.

| Setting | Behavior |
| --- | --- |
| **Profile** | Edit display name and email address. Both are optional; changing the email marks it unverified and triggers a new verification email. Form posts to [`PATCH /api/saas/account`](#account-profile); server re-reads the source of truth after save, so the UI always shows the canonical state. `409` if the new email is taken. |
| **Password** | Change your password by providing the current one (for re-verification) and the new password (≥ 8 chars). Form posts to [`POST /api/saas/account/password`](#email-verification--password); the new hash takes effect on next login. `401` if the current password is wrong or the account is missing. |
| **Data export (GDPR)** | Download a JSON snapshot of your account's personal data (profile + workspace memberships, no workspace content) via [`GET /api/saas/account/export`](#data-export-gdpr). The link is a standard authenticated `<a>` — the browser sends the session cookie automatically. |

The page is gating-safe (`notFound` when SaaS mode is off), redirect-safe (unsigned-in viewers are sent to `/account/login?next=/account/settings`), and marked `noindex, nofollow`. Like all user-facing SaaS pages, it is **SaaS-only additive** — the self-hosted app's byte-for-byte build is unchanged.

### Account profile

| Method | Path | Body | Result |
| --- | --- | --- | --- |
| `GET` | `/api/saas/account` | — | The caller's own profile: `{ account: { id, email, name, emailVerified, lastLoginAt, createdAt } }`. |
| `PATCH` | `/api/saas/account` | `{ name?, email? }` | Update display name and/or email. `409` if the new email is taken. |

### Workspace creation

An already-signed-in account may provision additional workspaces without signing out (the "create another workspace" flow). This mirrors the signup flow but for an existing account: it provisions a fresh Tenant with the caller as owner. Useful for household + side-project isolation, or separate client/business workspaces under one account.

Gating: 404 when SaaS off, 401 when not authenticated, 400 if name is invalid/missing or the account has reached its workspace limit (default 20 per account, adjustable in code).

| Method | Path | Body | Result |
| --- | --- | --- | --- |
| `POST` | `/api/saas/account/workspaces` | `{ name }` | **Authenticated.** Provisions a new Tenant with the caller as owner. Name is required (≤80 chars). Returns `201 { tenant: { id, slug, name, createdAt, … }, tenants: […] }` (the full tenant list so the client can update its workspace chooser). `400` if name is empty, >80 chars, or the account already owns 20 workspaces. |
| `DELETE` | `/api/saas/account/workspaces` | `{ tenant: slug }` | **Authenticated.** The caller leaves a workspace they currently belong to (self-service, any role). Returns `200 { ok: true, tenants: […] }` (the updated tenant list). `404` if the workspace does not exist or the caller is not a member. `409` if the caller is the workspace's last active owner — a workspace may never end up with zero owners; a sole owner must first promote another member to owner before leaving. |

The POST response mirrors `/api/saas/auth/signup`, and the audit trail records `workspace.created` with `actor` = the Account id and `meta.selfServe = true`. The DELETE operation records `membership.removed` with `actor` = the leaving Account and `target` = the workspace slug.

### Email verification & password

All of these live under `/api/saas/account/**`. The confirm and reset-request
routes are **unauthenticated** (the user proves ownership with a one-time token
from their inbox, or has forgotten their password); the verify-request and
password-change routes act on the **logged-in** account. Tokens are stored only
as SHA-256 hashes, are single-use, and an invalid or expired token always returns
the same generic `400` (no "unknown vs expired" distinction to leak).

| Method | Path | Body | Result |
| --- | --- | --- | --- |
| `POST` | `/api/saas/account/verify/request` | — | **Authenticated.** Mints a 24-hour email-verification token for the caller's own account and emails the link. Already-verified accounts short-circuit `200 { ok: true, alreadyVerified: true }` and mint nothing. |
| `POST` | `/api/saas/account/verify/confirm` | `{ token }` | Unauthenticated. Marks the email verified and clears the token. `200 { ok: true }`, or `400` for a missing/invalid/expired token. |
| `POST` | `/api/saas/account/reset/request` | `{ email }` | Unauthenticated. Mints a 1-hour reset token and emails the link **only** if the email is registered, but **always** responds `200 { ok: true }`. Anti-enumeration is enforced by body and by time: the response is padded to a fixed floor (`RESET_MIN_RESPONSE_MS`, 500 ms) and the outbound email is fired without awaiting, so a registered email is indistinguishable from an unknown one. A malformed email is a fast `400`. |
| `POST` | `/api/saas/account/reset/confirm` | `{ token, newPassword }` | Unauthenticated. Sets a fresh password hash (`newPassword` ≥ 8 chars) and clears the token. `200 { ok: true }`, or `400` for a bad password or a missing/invalid/expired token. |
| `POST` | `/api/saas/account/password` | `{ currentPassword, newPassword }` | **Authenticated.** Re-verifies the current password, then stores a fresh hash (`newPassword` ≥ 8 chars). A missing account and a wrong current password both return the same `401`. |

Neither the reset-confirm nor the password-change route force-expires existing
sessions; the new hash takes effect on the next login.

> **Dev scaffold:** until a mailer is wired up, the verify- and reset-request
> routes echo the freshly minted token back as `devToken` **only** outside
> production. In production an unwired mailer drops the token silently (fail
> closed), so nothing leaks. See [SaaS environment variables](#saas-environment-variables)
> for `RESEND_API_KEY` / `SMTP_URL` and the mailer setup.

### Multi-factor authentication (MFA)

A signed-in account can enable TOTP-based two-factor authentication (RFC 6238) to
protect against unauthorized access, even if the password is compromised. MFA
enrollment is optional and self-service; no account is forced to enable it.

The enrollment flow is **two-step by design**: a pending secret is generated first,
displayed as a QR code for the user's authenticator app, and only confirmed
(activated) after the user enters a valid TOTP code. This ensures a half-finished
setup can never silently activate MFA.

> **Implementation note:** MFA status tracking (pending vs. enabled) and recovery
> codes are stored in the Account document, encrypted at rest (AES-256-GCM) using
> the same `AUTH_SECRET`-derived key as BYO-key AI. **Login integration is not
> yet wired** (increment 80c, separate); enabling MFA here does not yet change
> what `POST /api/saas/auth/login` requires. Use `GET /api/saas/account/mfa` to
> query current status during development.

| Method | Path | Body | Result |
| --- | --- | --- | --- |
| `GET` | `/api/saas/account/mfa` | — | **Authenticated.** Returns the caller's MFA status: `{ enabled: boolean, pending: boolean, cryptoReady: boolean }`. `enabled` = MFA is active (a TOTP code was verified). `pending` = enrollment in progress (secret generated, awaiting confirmation). `cryptoReady` = the server has a valid `AUTH_SECRET` for encryption; a `false` value means recovery codes cannot be safely generated. `401` when signed out, `404` when the account no longer exists. |
| `POST` | `/api/saas/account/mfa` | — | **Authenticated.** Begins (or restarts) enrollment. Generates a fresh TOTP secret and returns `{ secret: string, uri: string }`. The `uri` is an `otpauth://` link (RFC 6238 format); render it as a QR code for the user's authenticator app, or display the plaintext `secret` for manual entry. The `secret` persists in the `mfaPendingSecretEnc` field and is replaced if the user calls this again before confirming. Does not activate MFA; must be confirmed with a real TOTP code via `POST .../mfa/confirm`. |
| `POST` | `/api/saas/account/mfa/confirm` | `{ code: string }` | **Authenticated.** Verifies the 6-digit TOTP `code` against the pending secret. On success (code matches within 30s window ±1 tick), activates MFA (`mfaEnabled = true`) and returns `{ enabled: true, recoveryCodes: string[] }`. **Recovery codes are shown exactly once**; the caller must display them to the user immediately for backup. Only scrypt hashes are stored; plaintext is never persisted. On failure (wrong code, missing secret, crypto unavailable), the account's MFA state is untouched and a generic `400` is returned. |
| `DELETE` | `/api/saas/account/mfa` | `{ password: string }` | **Authenticated.** Disables MFA and clears all secrets and recovery codes. Requires re-verification of the current password (`password` field) so a hijacked session alone cannot turn off the second factor. Returns `{ enabled: false }`. `401` on wrong credentials, `404` when the account no longer exists. Does not force-expire existing sessions; the disabled state takes effect on the next login. |

**Recovery codes:** When a user confirms MFA for the first time, the server generates
**10 single-use recovery codes** (e.g., `ABC12-34567-DEF89`). Each code can replace
one TOTP response if the user loses access to their authenticator. The server stores
only scrypt-hashed copies and splices out a hash when a code is used; once consumed,
the code is gone. Recovery codes are displayed as a downloadable list at enrollment
time; if lost, the only recovery path is `DELETE /api/saas/account/mfa` (password
re-verification required) to disable MFA entirely and start over.

### Data export (GDPR)

A signed-in account can download a machine-readable copy of the personal data the
platform holds about it (GDPR Art. 15 right of access + Art. 20 data portability).

| Method | Path | Body | Result |
| --- | --- | --- | --- |
| `GET` | `/api/saas/account/export` | — | **Authenticated.** Streams the caller's own personal data as a JSON attachment (`Content-Disposition: attachment; filename="pharos-account-<id>.json"`, `Cache-Control: no-store`). `401` when signed out, `404` when the account no longer exists (or when SaaS mode is off). |

The export reads **control-plane data only** — the account profile plus its
workspace memberships — and never touches a tenant's data database or the
self-hosted `User`/bearer path. Workspace **content** (Items, Receipts, …) is not
included here; it lives in each workspace's own isolated database and is exported
separately per workspace. Secrets (password hash, verify/reset tokens) are never
read: a pure assembler projects only a fixed whitelist of fields, so no secret
column can leak into the file. The payload shape:

```json
{
  "format": "pharos.account-export",
  "version": 1,
  "generatedAt": "2026-07-06T00:00:00.000Z",
  "notice": "This is a copy of the personal data associated with your Pharos account …",
  "account": {
    "id": "…",
    "email": "you@example.com",
    "name": "You",
    "emailVerified": true,
    "lastLoginAt": "2026-07-05T…",
    "createdAt": "2026-06-01T…",
    "updatedAt": "2026-07-05T…"
  },
  "memberships": [
    {
      "tenantSlug": "acme",
      "tenantName": "Acme",
      "plan": "pro",
      "role": "owner",
      "status": "active",
      "joinedAt": "2026-06-01T…"
    }
  ]
}
```

All memberships are included regardless of status (a complete record of what the
platform knows about the identity); a membership whose tenant was deleted
mid-export is skipped rather than emitted as a blank row.

#### Workspace content export (GDPR portability)

The account export above covers the **login identity**. Its complement dumps a
workspace's actual **content** — Items, Receipts, Statements, everything that lives
in the tenant's own isolated data database (GDPR Art. 20 portability at the workspace
level).

| Method | Path | Body | Result |
| --- | --- | --- | --- |
| `GET` | `/api/saas/workspace/export[?tenant=<slug>]` | — | **Owner/admin only.** Streams the workspace's content database as a JSON attachment (`Content-Disposition: attachment; filename="pharos-workspace-<slug>.json"`, `Cache-Control: no-store`). `404` when SaaS mode is off, `401` when signed out, `403` for non-owner/admin members. |

Because the export contains **every member's data** in the workspace, it is a
data-controller action gated to owner/admin (`requireManage`), not a self-service
per-member download. It works even for a suspended or canceled workspace
(`allowInactive`), because portability must not be gated on billing status.

The reader is **read-only and model-agnostic**: it opens the tenant-scoped connection
and dumps each collection through the raw Mongo driver, so it exports whatever the
tenant database holds without importing any feature model. It never writes to the data
plane; the only write is a control-plane `workspace.data_exported` audit row. Each
collection is capped at `WORKSPACE_EXPORT_MAX_DOCS` documents (default `10000`); a
collection that held more is cut to the cap and flagged `truncated` so the export never
silently claims completeness. Internal `system.*` collections (indexes, etc.) are
skipped.

**OSS parity:** this is SaaS-only. The reader refuses the implicit default tenant and
the route is 404 when `SAAS_MODE` is off, so the self-hosted single-user app is
untouched (it has its own JSON backup/restore under Settings → Storage & data). The
payload shape:

```json
{
  "format": "pharos.workspace-export",
  "version": 1,
  "generatedAt": "2026-07-06T00:00:00.000Z",
  "notice": "This is a machine-readable copy of the content stored in this Pharos workspace …",
  "workspace": { "slug": "acme", "name": "Acme", "plan": "pro", "status": "active" },
  "maxDocsPerCollection": 10000,
  "collections": [
    { "name": "items", "count": 128, "truncated": false, "docs": [ /* … */ ] },
    { "name": "receipts", "count": 10000, "truncated": true, "docs": [ /* … */ ] }
  ]
}
```

Collections are sorted by name so successive exports diff cleanly. The collection
`docs` are passed through verbatim (the user's own data handed back to them); only the
whitelisted workspace display fields (`slug`/`name`/`plan`/`status`) are projected into
the envelope, never secrets.

#### Workspace file-binary manifest (GDPR portability)

The content export above hands back the **Mongo collections**, but the binary files a
workspace references, the receipt and statement PDFs and the item photos, do **not**
live in Mongo. They live on disk under `STORAGE_ROOT`, referenced by each document's
`filePath` / `thumbPath` / `photos` fields. Without those binaries an export is
incomplete. This route closes that gap with a **report-only manifest**.

| Method | Path | Body | Result |
| --- | --- | --- | --- |
| `GET` | `/api/saas/workspace/export/files[?tenant=<slug>]` | — | **Owner/admin only.** Streams a JSON manifest of the binary files the workspace references (`Content-Disposition: attachment; filename="pharos-workspace-<slug>-files.json"`, `Cache-Control: no-store`). `404` when SaaS mode is off, `401` when signed out, `403` for non-owner/admin members. |

Same authorization and lifecycle as the content export: because the manifest describes
**every member's files**, it is a data-controller action gated to owner/admin
(`requireManage`), and it works for a suspended or canceled workspace (`allowInactive`),
because portability must not be gated on billing status. The write is a single
control-plane `workspace.files_manifested` audit row (with the file/present/missing/byte
totals in `meta`); nothing on the data plane or the filesystem is mutated.

It is **report-only by design** (mirrors the [erasure purge scan](#erasure-purge-scan-report-only)):
it never reads any file's **content** and produces **no archive**. Building the actual
tar/zip needs a streaming-archive dependency and is deferred ("Needs Achilleas"). Two
strictly read-only passes feed it:

- **DB pass** (model-agnostic): opens the tenant-scoped connection and, for each
  exportable collection, projects only the file-reference fields (`filePath`, `thumbPath`,
  `photos`), never loading full docs. References are validated as clean,
  `STORAGE_ROOT`-relative paths (blanks, absolute paths and `..` traversal rejected as
  defence-in-depth), then deduped and sorted.
- **Filesystem pass**: `stat`s each reference under `STORAGE_ROOT` (size only, never
  content). A reference that escapes the root, is missing, or errors is reported
  `exists: false, bytes: 0` rather than throwing, so one bad reference cannot sink the
  whole manifest.

**OSS parity:** SaaS-only. The DB reader refuses the implicit default tenant (self-hosted
has its own file-preserving JSON backup/restore) and the route is 404 when `SAAS_MODE` is
off, so the self-hosted single-user app is untouched. The payload shape:

```json
{
  "format": "pharos.workspace-files-manifest",
  "version": 1,
  "generatedAt": "2026-07-06T00:00:00.000Z",
  "notice": "Manifest of the binary files (receipt/statement PDFs, item photos) referenced by this Pharos workspace …",
  "workspace": { "slug": "acme", "name": "Acme", "plan": "pro", "status": "active" },
  "totals": { "files": 340, "present": 338, "missing": 2, "bytes": 51234567 },
  "files": [
    { "path": "receipts/2026/06/04_skroutz_wd_blue.jpg", "bucket": "receipts", "exists": true, "bytes": 184320 },
    { "path": "statements/2026/mastercard_7791_06.pdf", "bucket": "statements", "exists": true, "bytes": 220114 }
  ]
}
```

Files are sorted by path so successive manifests diff cleanly, and `totals` are computed
from the `files` list so the header never disagrees with the entries. Only the whitelisted
workspace display fields (`slug`/`name`/`plan`/`status`) are projected into the envelope,
never secrets. The `bucket` field is the top-level storage bucket (receipts / statements /
equipment / expenses / …) for grouping.

### Workspace erasure (GDPR)

The workspace owner can **schedule the permanent deletion** of a workspace and its
isolated data (GDPR Art. 17 right-to-erasure). The request is a **reversible marker**:
it stamps the workspace with a request timestamp and a scheduled purge instant a
grace window in the future, and can be cancelled any time before that instant. The
actual destructive drop of the tenant's data database is a **separate, manual/gated
flow** that runs only after the grace window elapses — it is never performed by this
route or by any automated routine.

Erasure is **orthogonal to the access lifecycle** (`status`): scheduling it does not
suspend the workspace, so the owner keeps full access during the grace window and can
change their mind without a status-restoration dance.

| Method | Path | Body | Result |
| --- | --- | --- | --- |
| `GET` | `/api/saas/workspace/erasure[?tenant=<slug>]` | — | **Any active member.** Returns the current erasure state. |
| `POST` | `/api/saas/workspace/erasure` | `{ tenant? }` | **Owner only.** Schedules permanent deletion after the grace window. Idempotent — an already-pending erasure returns its current state with no new audit row. `403` when not the owner; `400` if the request cannot be attributed to an account. |
| `DELETE` | `/api/saas/workspace/erasure[?tenant=<slug>]` | — | **Owner only.** Cancels a pending erasure. Idempotent — no pending erasure is a no-op with no audit row. `403` when not the owner. |

Gating (shared by all three verbs, via `resolveWorkspaceSession`): `404` when SaaS
mode is off, `401` when signed out, `403` when not a member (GET) or not the owner
(POST/DELETE). The session resolves even for an inactive workspace, so an owner mid-
erasure can still read and cancel it. All three verbs read/write **only the control-
plane `Tenant` doc** — never a feature route, a tenant's data database, or the self-
hosted `User`/bearer path. A scheduled request writes a `workspace.erasure_requested`
audit row (with the scheduled instant and grace days); a cancel writes
`workspace.erasure_canceled`.

Every response carries the same shape — the workspace slug, the grace window in days,
and the erasure projection:

```json
{
  "workspace": "acme",
  "graceDays": 30,
  "erasure": {
    "requested": true,
    "requestedAt": "2026-07-06T00:00:00.000Z",
    "scheduledAt": "2026-08-05T00:00:00.000Z",
    "requestedBy": "<account-id>",
    "graceDaysLeft": 30,
    "due": false
  }
}
```

`graceDaysLeft` counts whole days remaining (rounded up, clamped at 0), and `due`
flips true once the scheduled instant passes. Before any request is made, `requested`
is `false` and the timestamp fields are `null`.

> The grace window (`graceDays`) is currently a **30-day placeholder** (mirroring the
> GitHub/Google-style scheduled-deletion window) held in a single named constant; the
> final product value is still to be decided.

#### Delete workspace UI (settings page)

The workspace owner can request erasure via the **"Delete workspace" danger-zone panel**
in the workspace settings page (`/account/workspace/<slug>/settings`). The panel is
**owner-only** (members and admins see no button) and displays two states:

**Not requested (initial state):**
- Button: "Delete workspace" (red border + text)
- Copy: "Permanently delete this workspace and every member's data. There is a N-day grace window to change your mind before anything is erased."
- Clicking triggers a confirmation dialog: "Schedule this workspace for permanent deletion in N days? Every member will lose access and all data will be erased. You can cancel any time before then."
- On confirmation, sends `POST /api/saas/workspace/erasure` with `{ tenant: <slug> }`

**Requested (deletion scheduled):**
- Button: "Cancel deletion" (accent border + text)
- Copy: "Permanent deletion is scheduled (N days left). Every member will permanently lose access and all data will be erased once the window closes."
  - The countdown phrase updates live based on the server's `graceDaysLeft`: "1 day left", "due for deletion now", or "N days left"
- Clicking sends `DELETE /api/saas/workspace/erasure?tenant=<slug>` to cancel

**Error handling:** Failed requests (401/403/404/500) display a red error box with a human-readable message below the copy, and the button remains enabled for retry.

**Implementation:** The panel consumes the `/api/saas/workspace/erasure` GET endpoint (on page load, read server-side by the page layout) and the POST/DELETE endpoints (called from the client via the `ErasurePanel.tsx` component). Panel state refreshes via `router.refresh()` after every request, ensuring the countdown and button state are in sync with the server.

#### Erasure purge scan (report-only)

Once a workspace passes its grace window (`due: true`), it awaits **permanent
deletion**. A scheduler surfaces those due workspaces with a **report-only** scan so a
human can review them before anything is dropped. This route **never drops a database**:
its result is always `dryRun: true`. The actual destructive drop of a tenant's data
database is a **separate, manual/gated flow** that a person confirms; it is never
performed by this route or by any automated routine.

| Method | Path | Auth | Result |
| --- | --- | --- | --- |
| `POST` | `/api/saas/workspace/erasure/purge` | `Bearer <CRON_SECRET>` | Reports workspaces past their grace window that await deletion. `{ ok, scanned, dryRun, due, targets }`. `404` when SaaS off, `500` if `CRON_SECRET` unset, `401` on a bad token. |

Like the trial-lapse sweep, this is a **scheduler-driven** endpoint (a scheduler, not
a user, calls it), so it is guarded by the shared `CRON_SECRET` bearer with a constant-
time compare and fails closed (`500`) when the secret is unset, rather than by an
account session. It reads **only the control-plane `Tenant` collection** (via the same
due-workspace filter as the erasure lifecycle) and takes **zero writes** — the data
plane is never touched.

```json
{
  "ok": true,
  "scanned": true,
  "dryRun": true,
  "due": 1,
  "targets": [
    {
      "id": "<tenant-id>",
      "slug": "acme",
      "dbName": "tenant_acme",
      "requestedAt": "2026-07-06T00:00:00.000Z",
      "scheduledAt": "2026-08-05T00:00:00.000Z",
      "requestedBy": "<account-id>",
      "daysOverdue": 3
    }
  ]
}
```

Each `target` describes what a confirmed drop **would** remove: the workspace, the name
of the isolated data database that a real purge would drop (`dbName`), the erasure
markers, and `daysOverdue` (whole days past the scheduled instant, floored, ≥0 — the
mirror of `graceDaysLeft`). A candidate with a blank id or blank `dbName` is skipped
defensively so a report never names an un-purgeable (or unsafe-to-name) workspace. When
SaaS mode is off the scan is a no-op and returns `scanned: false` with an empty
`targets` array.

### Members and invitations

`/api/saas/members` manages a workspace's roster. Gating: 404 when SaaS off, 401
when signed out, 403 when not a member (GET) or not an owner/admin (write).

| Method | Path | Body | Result |
| --- | --- | --- | --- |
| `GET` | `/api/saas/members` | — | Roster of memberships joined to account email/name, plus pending invites. |
| `POST` | `/api/saas/members` | `{ email, role }` | Add a member. If an account exists, mints an active membership (subject to the seat limit → `409`). If not, **mints an invitation** and emails an accept link. Only an owner may assign `owner`. |
| `PATCH` | `/api/saas/members` | `{ accountId, role }` | Change a member's role. Cannot orphan the last owner. |
| `DELETE` | `/api/saas/members` | `{ accountId }` | Remove a member. Cannot remove the last active owner. |

#### Invite management

| Method | Path | Body | Result |
| --- | --- | --- | --- |
| `POST` | `/api/saas/invites/resend` | `{ inviteId, tenant? }` | **Authenticated; owner/admin only.** Re-mints a fresh token for an existing pending invite and re-sends the signup link to the invitee in a single call. Useful when the original link has expired before the invitee claimed it. The old token is invalidated (newest link wins). Idempotent for an invite awaiting the resend. `404` if there is no pending invite with that id in this workspace (an accepted or revoked invite cannot be resent — revoke-then-reinvite via `POST /api/saas/members` instead). `400` if the `inviteId` is malformed. Returns `{ resent: inviteId, invite: { email, role, status, expires }, devToken? }`. |
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

### Workspace settings

`/api/saas/workspace` is the "General" tab of workspace settings. Gating: 404 when
SaaS off, 401 when signed out, 403 for the wrong role per method. The `slug` and
internal `dbName` are immutable routing keys and cannot be changed here.

| Method | Path | Body | Result |
| --- | --- | --- | --- |
| `GET` | `/api/saas/workspace` | `?tenant=<slug>` | Workspace details for the settings view. Any active member may read. |
| `PATCH` | `/api/saas/workspace` | `{ name, tenant? }` | Rename the workspace display name. Owner/admin only. |
| `DELETE` | `/api/saas/workspace` | `{ tenant? }` | **Soft** cancel only: sets `status:'canceled'`. Owner only. The destructive drop of the tenant's isolated data database is a separate manual flow, never automated. |
| `POST` | `/api/saas/workspace/reactivate` | `{ tenant? }` | Reverse an owner-initiated soft-cancel (`canceled` → `active`). Owner only. `409` if the workspace is not in the `canceled` state (a `suspended` tenant is a billing hold cleared by paying, not a manual flip). |

### Bring-your-own-key management

`/api/saas/workspace/ai-key` stores a workspace's own encrypted AI provider key so
its AI calls run on that key (unmetered) instead of the platform's shared key. See
[Bring-your-own-key AI](#bring-your-own-key-ai-secret-at-rest) for the crypto. All
three methods are owner/admin only; the plaintext key is never returned, only a
masked `••••<last 4>` preview. Set/clear operations are written to the audit trail
(`ai_key.set` / `ai_key.cleared`), recording the provider only, never the key.

| Method | Path | Body | Result |
| --- | --- | --- | --- |
| `GET` | `/api/saas/workspace/ai-key` | `?tenant=<slug>` | `{ workspace, configured, key: { provider, masked } \| null, cryptoReady, providers }`. `cryptoReady` is false when `AUTH_SECRET` is unset (secrets cannot be stored); `providers` lists the accepted values. |
| `PUT` | `/api/saas/workspace/ai-key` | `{ provider, key, tenant? }` | Store or overwrite the key. `200 { configured: true, key: { provider, masked } }`. `400` if the provider is not one of `anthropic`/`openai`/`gemini`/`openrouter`/`custom` or the key is empty; `503 { code: 'crypto_unavailable' }` when `AUTH_SECRET` is unset. |
| `DELETE` | `/api/saas/workspace/ai-key` | `{ tenant? }` | Remove the key and revert to the platform key. `200 { configured: false }`. |

### Activity (audit)

| Method | Path | Query | Result |
| --- | --- | --- | --- |
| `GET` | `/api/saas/audit` | `?tenant=<slug>&action=<verb>&limit=<n>&before=<iso>` | Append-only activity trail for the workspace, newest first (members added/removed, role changes, invites, plan changes, `ai_key` events). Owner/admin only. `limit` is 1..200 (default 50); `before` is an ISO timestamp cursor returning events strictly older than it, for pagination; an unknown `action` applies no filter. The serializer projects whitelisted fields only, so no secret leaks. |

### Workspace console UI (`/account/workspace`)

The API sections above are the control-plane data plane; this is the **member-facing
browser console** that surfaces them — the signed-in account's self-service settings
for the workspaces it belongs to. It is a self-contained `(saas)` App Router segment
rendered inside a chrome-less shell (`WorkspaceShell`: workspace name, plan / status /
role badges, a tab bar, and a workspace switcher when the account is a member of more
than one). Each page is `force-dynamic` and marked `noindex, nofollow`.

| Route | Renders |
| --- | --- |
| `/account/workspace` | **Overview** — the account's landing for workspace settings. Consolidates the read surfaces into one server-rendered page: four stat tiles (members, AI calls with quota, storage with quota, this month's AI cost), a **Workspace** panel (slug, custom domain, isolation tier, created), a **Plan & billing** panel (plan, price, subscription status, trial note, AI + storage included) mirroring [`GET /api/saas/billing`](#billing-stripe), and a **Usage** panel for the current period (AI calls vs quota, input / output tokens, storage vs quota, estimated AI cost) mirroring [`GET /api/saas/usage`](#usage). SSR reads the billing/usage helpers directly rather than self-fetching. |
| `/account/workspace/members` | **Members** — the roster and pending invitations, mirroring [`GET /api/saas/members`](#members-and-invitations). Any active member may **view** the roster; only owners and admins (`canManage`) see the management controls (invite / add by email, change role, remove member, **resend** pending invite, revoke invite), which the client panel performs against `/api/saas/members` and `/api/saas/invites`. The **Resend** action re-mints a fresh token and re-sends the signup link for an expired-but-pending invite (calls [`POST /api/saas/invites/resend`](#invite-management)). Invites are read only for managers. |
| `/account/workspace/billing` | **Billing** — subscription management and invoice history. Shows the current plan (name, price, interval), subscription status, trial dates when applicable, and historical invoices from Stripe (if available). Owner/admin only. |
| `/account/workspace/usage` | **Usage** — detailed AI and storage consumption for the current period. Breaks down AI calls (input / output tokens, cost) per model and per day, and storage bytes used vs quota. Useful for understanding quota burndown. Any workspace member can view. |
| `/account/workspace/activity` | **Activity** — an audit trail of workspace changes. Shows append-only events (members added/removed, role changes, invites sent, plan changes, BYO-key events), newest first, with optional filtering by action type. Owner/admin only. Mirrors [`GET /api/saas/audit`](#activity-audit). |
| `/account/workspace/settings` | **Settings** — general workspace settings, AI key management, and dangerous zone. Owners and admins can rename the workspace display name (calls `PATCH /api/saas/workspace` with `{ name, tenant }`). An **AI key** section (owner/admin only, Dedicated tier only) lets the workspace owner store their own encrypted AI provider key (calls `GET`/`PUT`/`DELETE /api/saas/workspace/ai-key`, see [`Bring-your-own-key management`](#bring-your-own-key-management) below); when set, the workspace's AI calls run on that key (unmetered, zero platform cost) instead of the platform's shared key. Plaintext never reaches the UI — responses only return a masked last-4 preview. A **Data export** section (owner/admin only) provides two download links; the same idiom as [`/account/settings`](#account-settings-ui-accountsettings) for account-level GDPR portability: (1) "Download workspace data" links to [`GET /api/saas/workspace/export`](#workspace-content-export-gdpr-portability), yielding a JSON dump of the workspace's Mongo content (items, receipts, expenses, etc., for all members); (2) "Download file manifest" links to [`GET /api/saas/workspace/export/files`](#workspace-file-binary-manifest-gdpr-portability), yielding a JSON list of stored receipt/statement/photo file paths (metadata only, not file contents). The owner can soft-cancel the workspace (calls `DELETE /api/saas/workspace`, all members lose access) or reactivate a canceled workspace (calls `POST /api/saas/workspace/reactivate`). Cancellation is reversible; reactivation restores member access. Owner/admin for rename, AI key, and data export; owner only for cancel/reactivate. |

The tab bar (`workspaceTabs`) lists **Overview**, **Members**, **Billing**, **Usage**, **Activity**, and **Settings**.
Every tab link carries the active `?w=<slug>` workspace selection through, so switching panels stays
on the same workspace; a blank selection yields clean URLs against the account's first workspace.

**Empty and edge states.** A signed-in account with **zero** memberships (for example,
removed from its last workspace) is a real state, not an error: `/account` renders a
"No workspace yet" empty state with a **"Create workspace" form** auto-opened (the `CreateWorkspaceForm`
component wrapping [`POST /api/saas/account/workspaces`](#workspace-creation)), allowing the account
to immediately provision a new workspace. Members tab redirects to the same empty state. A `?w=<slug>`
the account is not a member of is `notFound()` (`404`). Billing / management CTAs that are not yet
wired (subscribe / manage subscription) render as "coming soon" copy rather than dead buttons. When
an account has one or more workspaces, the create form is available as a collapsed toggle in the
workspace chooser header (not auto-opened).

**Gating.** The `(saas)` segment layout `404`s the whole tree when `SAAS_MODE` is off
or account auth is not configured (`AUTH_SECRET` unset), so the self-hosted app never
mounts these routes and stays byte-for-byte unchanged. A logged-out viewer is
redirected to `/account/login?next=…` (preserving the `?w=` selection), unlike the
[Superadmin console](#superadmin-console-8), which shows no login prompt on purpose.

**OSS parity:** SaaS-only and entirely additive (new `app/(saas)/account/workspace`
pages plus `components/saas/*`). With `SAAS_MODE` off the segment self-gates to `404`,
so nothing changes for the self-hosted build.

### Superadmin console (§8)

A separate, **platform-operator** surface for the person running the Pharos
deployment, distinct from the per-workspace owner/admin roles above. A
superadmin can see the control plane across **all** tenants; it is not a role
stored on any workspace, and there is no in-app path to become one.

Authorization is an **env allowlist**, `SAAS_SUPERADMIN_EMAILS`, matched against
the signed-in account's email (comma, semicolon, or whitespace separated;
entries without an `@` are dropped). Because membership lives in env and not the
database, a compromised account row cannot mint a superadmin. An empty or unset
allowlist means the console is simply not enabled.

| Method | Path | Query | Result |
| --- | --- | --- | --- |
| `GET` | `/api/saas/admin/tenants` | `?status=<s>&q=<term>&limit=<n>&offset=<n>` | Read-only, cross-tenant registry listing, newest first. Returns a display-safe summary per workspace: `slug`, `name`, `plan`, `status`, `tier`, `customDomain`, `trialEndsAt`, `erasureScheduledAt`, `billingLinked` (a Stripe customer or subscription id is set), `aiByoKey`, `createdAt`, `updatedAt`. `no-store`. |

Query rules:

- `limit` is clamped to 1..100 (default 50); a non-numeric or non-positive value
  falls back to the default. `offset` is floored to `≥ 0`.
- `status` filters on an exact `Tenant` status (`pending`, `trialing`,
  `active`, `suspended`, `canceled`); any other value is ignored (no filter).
- `q` is a case-insensitive substring match across `slug`, `name`, and
  `customDomain`. The term is regex-escaped, so metacharacters are matched
  literally, never interpreted as a pattern.

Authorization order (each hides the console a little more from non-operators):

| Condition | Response |
| --- | --- |
| `SAAS_MODE` off / `AUTH_SECRET` unset | `404` / `500` (endpoint absent for self-hosted) |
| `SAAS_SUPERADMIN_EMAILS` unset or empty | `404` (console not enabled; existence not revealed) |
| Not signed in | `401` |
| Signed in, email not in the allowlist | `403` |
| Allowed, but the account row was deleted | `401` (stale cookie) |

Response envelope (`format: pharos.admin-tenant-listing`, version `1`):

```json
{
  "format": "pharos.admin-tenant-listing",
  "version": 1,
  "generatedAt": "2026-07-07T13:00:00.000Z",
  "total": 128,
  "count": 50,
  "limit": 50,
  "offset": 0,
  "filter": { "status": "active", "q": null },
  "tenants": [
    {
      "id": "665f...",
      "slug": "acme",
      "name": "Acme",
      "plan": "shared",
      "status": "active",
      "tier": "pro",
      "customDomain": null,
      "trialEndsAt": null,
      "erasureScheduledAt": null,
      "billingLinked": true,
      "aiByoKey": false,
      "createdAt": "2026-06-01T09:00:00.000Z",
      "updatedAt": "2026-07-01T09:00:00.000Z"
    }
  ]
}
```

`total` is the full match count for the filter (for paging); `count` is the
number of rows in this page. The console is **observability only**: it reads
just the central `Tenant` registry, never opens a per-tenant data database, and
never writes. Destructive operations stay manual and out of scope here.

**OSS parity:** SaaS-only. The route is `404` when `SAAS_MODE` is off, and there
is no equivalent in the self-hosted single-tenant app (there is nothing to list
across; the operator owns the one deployment).

#### Single-tenant detail

Drill into **one** workspace from the listing. Same platform-operator gate
(`requireSuperadmin`) and the same authorization order as the listing above; an
unknown slug is a `404`.

| Method | Path | Result |
| --- | --- | --- |
| `GET` | `/api/saas/admin/tenants/<slug>` | Read-only detail for one workspace: the registry summary (same fields as a listing row), its full member roster, a role/status tally, and a usage rollup (AI consumption + storage footprint). `no-store`. |

The slug is trimmed and lower-cased before lookup, so `/Acme` and `acme` resolve
to the same workspace. Like the listing, this reads **only** the central
registry collections (`Tenant`, `Membership`, `Account`) plus the control-plane
`Usage` ledger (below); it never opens a per-tenant data database and never
writes.

Each member row is display-safe: only `email` and `name` are read from the
account (never a password hash or token), and a dangling membership (its account
row deleted) yields empty `email`/`name` rather than an error. The tally counts
members by status (`active`/`invited`/`removed`); roles (`owners`/`admins`/
`members`) are counted for **active** members only, so `owners` reflects the
actual live owner seats, which makes an ownerless workspace easy to spot.

The `usage` rollup is sourced **entirely** from the central `Usage` ledger, the
same control-plane collection the metering endpoints already sample into. The
operator sees a footprint/AI-consumption view **without** this endpoint ever
opening a per-tenant data database or running `db.stats()` itself. It reads at
most the 12 most-recent monthly rows and shapes them into:

- `totals` — the monotonic AI counters (`aiCalls`, `aiInputTokens`,
  `aiOutputTokens`, `aiCostMicros`) **summed** across the returned months.
  `aiCostMicros` is estimated spend in currency micros (millionths of one unit).
- `latestStorageBytes` / `latestStorageMeasuredAt` — storage is a **gauge**, not
  additive, so it is taken from the period with the newest measurement timestamp
  rather than summed (summing an overwritten footprint would be wrong).
- `periods[]` — the per-month rows, most-recent first.

All numeric fields are defensively coerced to non-negative integers, so a
garbage or negative stored value can never surface. The self-hosted
`DEFAULT_TENANT` never writes `Usage` docs, so for it (and whenever SaaS mode is
off) the rollup is an **empty** summary (`periodCount: 0`, zero totals) — no
effect on the OSS app.

Response envelope (`format: pharos.admin-tenant-detail`, version `2`):

```json
{
  "format": "pharos.admin-tenant-detail",
  "version": 2,
  "generatedAt": "2026-07-09T13:00:00.000Z",
  "tenant": {
    "id": "665f...",
    "slug": "acme",
    "name": "Acme",
    "plan": "shared",
    "status": "active",
    "tier": "pro",
    "customDomain": null,
    "trialEndsAt": null,
    "erasureScheduledAt": null,
    "billingLinked": true,
    "aiByoKey": false,
    "createdAt": "2026-06-01T09:00:00.000Z",
    "updatedAt": "2026-07-01T09:00:00.000Z"
  },
  "memberCounts": {
    "total": 3,
    "active": 2,
    "invited": 1,
    "removed": 0,
    "owners": 1,
    "admins": 1,
    "members": 0
  },
  "members": [
    {
      "accountId": "665a...",
      "email": "owner@acme.example",
      "name": "Acme Owner",
      "role": "owner",
      "status": "active",
      "invitedBy": null,
      "createdAt": "2026-06-01T09:00:00.000Z"
    }
  ],
  "usage": {
    "periodCount": 2,
    "totals": {
      "aiCalls": 412,
      "aiInputTokens": 918400,
      "aiOutputTokens": 121200,
      "aiCostMicros": 3450000
    },
    "latestPeriod": "2026-07",
    "latestStorageBytes": 734003200,
    "latestStorageMeasuredAt": "2026-07-09T02:00:00.000Z",
    "periods": [
      {
        "period": "2026-07",
        "aiCalls": 190,
        "aiInputTokens": 402000,
        "aiOutputTokens": 55200,
        "aiCostMicros": 1500000,
        "storageBytes": 734003200,
        "storageMeasuredAt": "2026-07-09T02:00:00.000Z"
      }
    ]
  }
}
```

Members are ordered oldest-first (`createdAt`, then `_id`). Same observability
contract: no writes, no destructive actions, control plane only.

#### Fleet overview

A single, fleet-wide summary that complements the per-workspace listing and
detail above: instead of a row per tenant, one aggregate across the **whole**
SaaS. Same platform-operator gate (`requireSuperadmin`) and the same
authorization order as the listing.

| Method | Path | Result |
| --- | --- | --- |
| `GET` | `/api/saas/admin/overview` | Read-only, cross-tenant aggregate: tenant counts by plan/status/tier (plus billing-linked / BYO-key / custom-domain / erasure-scheduled flags), total accounts, active-member count, and this month's usage totals summed from the `Usage` ledger. `no-store`. |

Like the listing and detail, this reads **only** the central registry
collections (`Tenant`, `Account`, `Membership`) plus the control-plane `Usage`
ledger; it never opens a per-tenant data database, never runs `db.stats()`, and
never writes.

The counts are shaped so a plan/status/tier with no tenants still appears (its
known keys are pre-seeded to `0`), yet an unexpected stored value is still
counted under its own key rather than silently dropped. The usage totals are for
the **current month** only:

- The AI counters (`aiCalls`, `aiInputTokens`, `aiOutputTokens`, `aiCostMicros`)
  are monotonic per month, so summing across tenants gives the fleet's volume
  for the month. `aiCostMicros` is estimated spend in currency micros.
- `storageBytes` is a per-tenant **gauge**; each `Usage` row already holds one
  tenant's latest snapshot for the period, so summing across tenants is correct
  (it is not summing a running counter). Tenants with no `Usage` row this month
  contribute `0` and are excluded from `tenantsReporting`.

All numeric fields are floored at `0`. With SaaS mode off the endpoint is `404`,
and the self-hosted `DEFAULT_TENANT` has no registry or `Usage` rows, so there is
nothing to aggregate.

Response envelope (`format: pharos.admin-overview`, version `1`):

```json
{
  "format": "pharos.admin-overview",
  "version": 1,
  "generatedAt": "2026-07-09T13:00:00.000Z",
  "period": "2026-07",
  "tenants": {
    "total": 128,
    "byPlan": { "free": 40, "shared": 70, "dedicated": 18 },
    "byStatus": { "pending": 2, "trialing": 9, "active": 110, "suspended": 5, "canceled": 2 },
    "byTier": { "shared": 110, "pro": 18 },
    "billingLinked": 96,
    "aiByoKey": 12,
    "customDomain": 7,
    "erasureScheduled": 1
  },
  "accounts": 240,
  "activeMembers": 205,
  "usage": {
    "tenantsReporting": 88,
    "aiCalls": 41200,
    "aiInputTokens": 91800000,
    "aiOutputTokens": 12120000,
    "aiCostMicros": 345000000,
    "storageBytes": 82348179456
  }
}
```

Same observability contract: no writes, no destructive actions, control plane
only.

#### Live storage footprint (on-demand `db.stats()`)

The [detail endpoint](#single-tenant-detail) reports the **last sampled**
storage figure from the `Usage` ledger; this endpoint takes a fresh, read-only
`db.stats()` against one tenant's own data database **right now**. Use it to see
a live footprint on demand (e.g. before an operator decision) without waiting for
the next metering sample. Same platform-operator gate; an unknown slug is a
`404`.

| Method | Path | Result |
| --- | --- | --- |
| `GET` | `/api/saas/admin/tenants/<slug>/dbstats` | Read-only LIVE footprint: a fresh `db.stats()` against the tenant's data database plus its on-disk file bytes. It **never** records a `Usage` sample, so viewing a footprint has zero side effects. `no-store`. |

The slug is resolved from the central `Tenant` registry; only that tenant's
data-plane `db.stats()` and file subtree are read. Unlike the detail rollup, this
does open the per-tenant data database (read-only) to run the live command, but
it still never writes.

`measured` is `true` when a live `db.stats()` actually ran; it is `false` when
the connection had no native db handle, in which case the db footprint is all
zeros while file bytes are still counted. All numeric fields are floored at `0`,
so a garbage or negative raw value can never surface.

Response envelope (`format: pharos.admin-tenant-dbstats`, version `1`):

```json
{
  "format": "pharos.admin-tenant-dbstats",
  "version": 1,
  "generatedAt": "2026-07-09T21:40:00.000Z",
  "slug": "acme",
  "dbName": "tenant_acme",
  "measured": true,
  "live": {
    "dataSize": 512000000,
    "storageSize": 268435456,
    "indexSize": 33554432,
    "objects": 18420,
    "dbBytes": 301989888,
    "fileBytes": 734003200,
    "totalBytes": 1035993088
  }
}
```

Field meanings: `dataSize` is the uncompressed logical size of all documents;
`storageSize` and `indexSize` are the physical on-disk (compressed) collection
and index footprints; `objects` is the document count. `dbBytes` is the **billed**
MongoDB footprint (`storageSize + indexSize`) — the same definition the metering
sampler uses — and `totalBytes` = `dbBytes + fileBytes`, the figure a storage
quota is checked against. `fileBytes` is the tenant's binary-file footprint (`0`
until the storage layer is tenant-aware). SaaS-only: `404` when SaaS mode is off.

#### Console UI (`/admin`)

The endpoints above are the read-only data plane; this is the **browser console**
that surfaces them. It is a self-contained App Router segment (`/admin/*`) with
its **own** chrome — a minimal operator shell (Pharos wordmark, an `Admin` badge,
the console nav, and the signed-in operator's email), deliberately **not** the
app's tenant-facing navigation, so no shared layout or component is touched.

| Route | Renders |
| --- | --- |
| `/admin` | **Fleet overview** — the same aggregate as [`GET /api/saas/admin/overview`](#fleet-overview), rendered as stat tiles (workspaces, accounts, active members, billing-linked / BYO-key, this month's AI calls / tokens / cost, storage + reporting count) and breakdown lists (by plan, status, tier) plus custom-domain and erasure-scheduled counts. Shows an empty-state line until the first tenants sign up and metering runs. |
| `/admin/tenants` | **Workspaces listing** — the same registry reader as [`GET /api/saas/admin/tenants`](#superadmin-console-8), rendered as a paginated table (workspace name + slug + custom domain, plan, status badge, tier, billing / BYO-key pills, created). Filter by status and free-text search (slug, name or domain) via a plain **GET** form, so the URL is the source of truth and every filtered view is shareable and bookmarkable with no client state. Prev / next links preserve the active filter. Each row links to the detail page. |
| `/admin/tenants/[slug]` | **Workspace detail** — the same detail reader as the [single-tenant](#single-tenant-detail) API: a registry summary (slug, plan, tier, custom domain, billing / BYO-key, trial-ends, erasure-scheduled, created / updated), a member tally (total, active, owners — flagged red **ownerless!** at zero, invited, removed), a usage roll-up (total AI calls / tokens / cost across periods, latest storage footprint), and the full member roster (email, role badge, status badge, joined). An unknown slug is `notFound()` (`404`). |

The nav (`AdminNav`) lists Overview and Workspaces; more console pages are
additive entries as they land. Section links match their sub-paths (so
`/admin/tenants/<slug>` keeps **Workspaces** highlighted), while Overview matches
`/admin` exactly.

**Self-gating (the console does not exist for non-operators).** A page cannot
return a status code, so instead of the API's `requireSuperadmin()` (which returns
`401`/`403`/`404` responses), the pages use a page-shaped mirror,
`requireSuperadminPage()`, that resolves the viewer or throws `notFound()`. Every
non-operator branch collapses to the **same 404**, in the same order as the API
gate:

| Condition | Result |
| --- | --- |
| `SAAS_MODE` off, or account auth not configured (`AUTH_SECRET` unset) | `404` (segment absent for the self-hosted app) |
| `SAAS_SUPERADMIN_EMAILS` unset or empty | `404` (console not enabled; existence not revealed) |
| Not signed in | `404` (**no** login redirect — a form would reveal the console exists) |
| Signed in, email not in the allowlist | `404` |
| Allowed, but the account row was deleted | `404` (stale cookie; defence in depth) |

There is **no** login prompt on purpose: an operator signs in through the normal
SaaS auth flow, and only then does `/admin` resolve. The gate runs on **both** the
segment layout and each page (defence in depth), the segment is `force-dynamic` so
the authorization decision is never cached, and the shell is marked
`noindex, nofollow`.

The display formatting (`components/saas/format.ts`) is pure and client-safe (no
DB, no `next/*`, no node builtins) and defensive: non-finite or negative inputs
render a sane zero (`0`, `0 B`, `$0.00`, `—`) rather than `NaN` / `-1 B`, because a
garbled number on an operator dashboard reads as a real, alarming value.

**OSS parity:** SaaS-only, and entirely additive (new `app/admin` and
`components/saas` folders; no existing file changed). With `SAAS_MODE` off the
whole segment self-gates to `404`, so the self-hosted build is byte-for-byte
unchanged and `/admin` simply does not exist.

## SaaS environment variables

These are needed **only** in SaaS mode. Use placeholders; never commit real
secrets. They are not part of the self-hosted `.env.example` yet
(TODO: add a documented SaaS block there).

| Variable | Purpose |
| --- | --- |
| `SAAS_MODE` | Master switch (see above). |
| `SAAS_BASE_DOMAIN` | Base domain for tenant subdomains (`<slug>.<domain>`). Defaults to `ph-aros.com`; override for localhost/staging. |
| `SAAS_SESSION_IDLE_HOURS` | Idle lifetime for the account session cookie. |
| `SAAS_SUPERADMIN_EMAILS` | Allowlist of platform-operator emails for the [superadmin console](#superadmin-console-8) (comma / semicolon / whitespace separated). Unset or empty disables the console entirely (`404`). |
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
| `WORKSPACE_EXPORT_MAX_DOCS` | Per-collection document cap for the workspace content export ([above](#workspace-content-export-gdpr-portability)). Non-numeric/non-positive falls back to `10000`; collections beyond it are flagged `truncated`. |

When neither `RESEND_API_KEY` nor `SMTP_URL` is set, the mailer cannot deliver;
in non-production it logs the message instead of sending, so invite/reset flows
still work locally.

## See also

- [Docs index](README.md)
- [Self-hosting](self-hosting.md) — running the open-source single-tenant app.
- [Configuration](configuration.md) — AI providers, storage, notifications, i18n.
- [API reference](api.md) — the self-hosted bearer-token REST API (`/api/v1`),
  distinct from the cookie-based control-plane API above.
