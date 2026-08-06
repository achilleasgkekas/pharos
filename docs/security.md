# Security

How Pharos protects your data, what its default threat model assumes, and the
checklist to follow before you expose an instance beyond your LAN or VPN.

This guide is written for operators. For the point-in-time hardening log and how
to report a vulnerability, see the repo-root **[SECURITY.md](../SECURITY.md)**.

---

## The default posture

Pharos ships as a **single-tenant household hub, behind an app login, reached
over WireGuard or your LAN.** Only the web container's port (`web:3000`) is meant
to face the network; the database and every optional companion stay private.

- **Everything requires a login.** There is no anonymous read path, not even for
  served files.
- **AI is optional and off until you configure it.** With no provider set, no
  document ever leaves the box. See [Configuration](configuration.md#ai-providers).
- **Local-first storage.** Files are served from local disk; remote backends
  (SMB/FTP/OneDrive) are a push-only mirror, never a live dependency. See the
  [Glossary](glossary.md).

If you keep it VPN- or LAN-only, the login is a second layer on top of network
isolation. If you plan to publish it to the public internet, work through the
[hardening checklist](#exposing-to-the-internet) below first.

---

## Two authentication surfaces

Pharos has two independent front doors. Both are described in
[Architecture](architecture.md); the security-relevant details are here.

### 1. Session cookie (the web UI)

Used by every browser page and server action.

- **Edge middleware** (`middleware.ts`) verifies a signed session JWT on **every**
  request and gates everything, including files served at `/api/files`.
  Unauthenticated page requests redirect to `/login`; API and file requests get a
  `401`.
- **First-run wizard** (`/setup`) creates the first admin when zero users exist.
  Additional accounts are managed in **Settings → Users** and can be assigned one
  of three roles: **admin** (full read-write), **member** (read-write), or **viewer**
  (read-only, cannot modify any data).
- **Passwords** are hashed with `scrypt` (via `node:crypto`, no native deps),
  stored as a self-describing hash, and compared with `timingSafeEqual`.
- **Sessions** are `jose` HS256 JWTs in an `httpOnly`, `sameSite=lax` cookie signed
  with `AUTH_SECRET`. Set `AUTH_COOKIE_SECURE=true` when serving over HTTPS.
  Rotating `AUTH_SECRET` invalidates every session (everyone re-logs-in).
- **Server actions**: middleware blocks unauthenticated calls; system-settings and
  user-management actions additionally enforce an admin-role check. All mutating
  actions (create, update, delete) check the user role at the top with `assertCanWrite()`
  and deny viewers (returning 403) — this enforcement is built-in to every current
  and future server action. The **REST API** (see below) enforces the same restriction:
  viewer tokens cannot make POST/PATCH/DELETE requests.
- **Two-factor authentication (TOTP), opt-in per user.** Turn it on from
  **Settings → Account → Two-factor authentication**: scan the shown secret in any
  TOTP app, confirm one code, and Pharos hands you a one-time batch of recovery
  codes (shown once — store them somewhere safe, each is single-use). Once enabled,
  a correct password no longer opens a session by itself: the login form asks for a
  second step (the 6-digit code, or a recovery code) before a real session cookie is
  issued, backed by a short-lived, separately-cookied pending token rather than the
  session cookie itself. Code/recovery-code verification is rate-limited per user id
  using the same `API_RATE_LIMIT` / `API_RATE_WINDOW_MS` config as the REST API (see
  [Rate limiting](#rate-limiting), disabled by default). Disabling MFA, or
  re-enrolling a device over an already-enabled factor, requires re-entering the
  current password. The TOTP secret is encrypted at rest the same way as other
  integration secrets (AES-256-GCM, keyed off `AUTH_SECRET`) and the plaintext is
  only ever shown once, at enrollment time. This mirrors the MFA primitive already
  used on the hosted/SaaS side, reused for the self-hosted `User` model.

### 2. Bearer token (the REST API)

Used by any [API v1](api.md) client.

- **Get a token:** `POST /api/v1/auth/login` with `{ username, password }` returns
  `{ token, user }`. The token is the user's `apiToken` (format `phk_<random>`),
  created on first login. It is the same token shown in **Settings → API/MCP**.
- **Use it:** send `Authorization: Bearer <token>` on every other `/api/v1`
  request. A shared helper resolves the token to a user; a missing or unknown
  token returns `401 Unauthorized — send Authorization: Bearer <token>`.
- **Scope:** the token carries the user's role, so API access mirrors what that
  account can do in the UI.
- **Revoke / rotate:** regenerate the token in **Settings → API/MCP**. The old
  token stops working immediately; re-sign-in on each device to pick up the new one.

> Treat the bearer token like a password. It is long-lived and grants full API
> access for that account. Do not commit it, log it, or paste it into shared
> chats.

---

## Rate limiting

The REST API has an **optional, config-gated** rate limiter (`lib/apiRateLimit.ts`),
**off by default** so a single-user instance never trips it.

- Enable it with env vars (see [Configuration](configuration.md)):

  | Variable | Meaning | Default |
  | --- | --- | --- |
  | `API_RATE_LIMIT` | Max requests per window per key. Unset or `<= 0` disables it. | disabled |
  | `API_RATE_WINDOW_MS` | Window length in milliseconds. | `60000` (1 min) |

- It is a fixed-window counter keyed by **API-token user id** for authenticated
  routes and by **client IP** for the unauthenticated login route (so it blunts
  brute-force login attempts too).
- When tripped it returns `429` with `Retry-After` and `X-RateLimit-*` headers.
- The counter is per-process and in-memory, so a restart resets it, acceptable for
  abuse protection. For a public deployment, also put a rate limit in your reverse
  proxy as a durable outer layer.

---

## Built-in hardening

These protections are always on; you do not configure them.

- **Path traversal** — `readFile` / `deleteFile` resolve and contain every path
  inside the storage root, blocking `..` or absolute-path escapes from a route
  param or a tampered database `filePath`.
- **SSRF** — `assertPublicUrl()` (web and scraper) resolves the target host and
  rejects private, loopback, link-local, and internal addresses before any
  URL-import or image fetch, so the scraper cannot be pointed at Mongo, SearXNG,
  Ollama, or the rest of your LAN. Fetched images are capped at 20 MB.
- **Upload caps** — receipt and expense uploads reject files over 15 MB.
- **Import sanitisation** — JSON restore strips attacker-controlled
  `filePath` / `thumbPath` / `photos` before writing.
- **Untrusted HTML receipts** — email-sourced HTML served from `/api/files` gets a
  strict CSP (`default-src 'none'`, same-origin/`data:` images only), so a
  malicious receipt cannot run script or beacon home when you open it.
- **CSV/formula injection** — CSV export neutralises leading `= + - @`.
- **Secret redaction** — the Anthropic client redacts the API key from error
  strings before they reach logs.

---

## Secrets

- `AUTH_SECRET`, `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`, and `MONGO_PASS` live in
  `.env` (gitignored). Generate strong random values, for example
  `openssl rand -base64 32`. See [Self-hosting](self-hosting.md#3-configure-env).
- **Integration secrets stored in the database** (AI keys, the OneDrive refresh
  token, SMB/FTP passwords) are currently kept in plaintext in Mongo. That is
  acceptable **only while Mongo is bound to loopback and protected by a strong
  password**, which is the shipped default. Encrypt-at-rest is a planned next step
  if your threat model widens; until then, do not expose Mongo to the network.
- Never place real secrets in `docker-compose.yml`, a committed file, or a support
  paste. When sharing config for help, replace every secret with a placeholder.

---

## Network exposure

The shipped `docker-compose` binds the sensitive services (Mongo, Mongo Express,
FlareSolverr, SearXNG) to `127.0.0.1`; only `web:3000` is published. Keep it that
way. The recommended topologies, cheapest first:

1. **VPN-only** (WireGuard on the gateway) — the intended default. Nothing is
   reachable from the public internet.
2. **LAN-only** — fine on a trusted home network; still behind the app login.
3. **Public, behind a reverse proxy with HTTPS** — only if you need it, and only
   after the checklist below.

---

## Exposing to the internet

If you must publish Pharos publicly, do all of the following:

- [ ] Put it behind a reverse proxy that terminates **HTTPS** (Caddy, Nginx Proxy
      Manager, Traefik). Never serve the app over plain HTTP on the internet.
- [ ] Set **`AUTH_COOKIE_SECURE=true`** so the session cookie is only sent over
      HTTPS.
- [ ] Set strong, unique **`AUTH_SECRET`** and **`NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`**
      (rotate them from any committed example values).
- [ ] Rotate the initial **`MONGO_PASS`** on the live database, not just in `.env`
      (the data volume was initialised with the old password). The exact commands
      are in the repo-root [SECURITY.md](../SECURITY.md) under "Manual apply".
- [ ] Keep Mongo and the companions bound to `127.0.0.1` (do not "fix" them to
      `0.0.0.0`).
- [ ] Turn on **`API_RATE_LIMIT`** and add a rate limit at the reverse proxy.
- [ ] Give each person their own **member/admin account**; do not share one login.
- [ ] Encourage (or require) admin accounts to enable **two-factor authentication**
      (Settings → Account) — a second factor matters more once the login form is
      internet-reachable.
- [ ] Keep the image **[up to date](updating.md)** so you get security fixes.
- [ ] Take regular **[backups](backup-and-restore.md)** — a compromise recovery
      needs a known-good copy.

There is no password-reset email flow yet: an admin resets other users' passwords
from **Settings → Users**.

---

## Reporting a vulnerability

Please report security issues privately rather than opening a public issue. See
the repo-root **[SECURITY.md](../SECURITY.md)** for the current disclosure note and
the full hardening log.

---

## See also

- [Architecture](architecture.md) — the two auth surfaces and where they sit.
- [Configuration](configuration.md) — env vars, AI providers, storage backends.
- [Self-hosting](self-hosting.md) — env setup, HTTPS, first-run admin.
- [API reference](api.md) — bearer auth and every endpoint.
- [Backup & restore](backup-and-restore.md) — the offline dump and Trash net.
- Repo-root [SECURITY.md](../SECURITY.md) — hardening log and reporting.
