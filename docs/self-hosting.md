# Self-hosting PHAROS

This guide takes you from an empty host to a running PHAROS instance with your
own admin account. It targets Docker Compose, which is the supported way to run
PHAROS in production.

PHAROS is a self-hosted personal hub (inventory, receipts, expenses, credit-card
installments, subscriptions, vouchers, tasks) with **optional** AI document
parsing. Nothing here requires an AI key; AI is off until you configure it.

- [1. Prerequisites](#1-prerequisites)
- [2. Get the files](#2-get-the-files)
- [3. Configure `.env`](#3-configure-env)
- [4. Start the stack](#4-start-the-stack)
- [5. First-run admin setup](#5-first-run-admin-setup)
- [6. Optional profiles](#6-optional-profiles)
- [7. Storage & backups](#7-storage--backups)
- [8. Updating](#8-updating)
- [9. Running behind HTTPS / a reverse proxy](#9-running-behind-https--a-reverse-proxy)
- [10. Troubleshooting](#10-troubleshooting)

---

## 1. Prerequisites

- **Docker** with the Compose plugin (`docker compose`, v2). A recent Docker
  Desktop (macOS/Windows) or Docker Engine (Linux) is fine.
- **~2 GB RAM** for the base stack (web + MongoDB + SearXNG). More if you also
  run local AI (Ollama, which runs outside these containers).
- A host reachable on **port 3000** (LAN, VPN, or behind a reverse proxy).
- `openssl` available to generate secrets (standard on macOS/Linux).

AI is optional. If you want fully local, private AI parsing you can run
[Ollama](https://ollama.com) natively on the host; the container reaches it at
`http://host.docker.internal:11434`. See [configuration.md](configuration.md)
once it exists, or **Settings → AI** in the app.

---

## 2. Get the files

You have two options.

### Option A — prebuilt image (recommended)

No source checkout needed. Grab just the production compose file and an env file
onto the host:

```bash
mkdir pharos && cd pharos
curl -O https://raw.githubusercontent.com/achilleasgkekas/pharos/main/docker-compose.prod.yml
curl -o .env https://raw.githubusercontent.com/achilleasgkekas/pharos/main/.env.example
```

`docker-compose.prod.yml` pulls the published image
`ghcr.io/achilleasgkekas/pharos:latest` instead of building from source.

### Option B — build from source

```bash
git clone https://github.com/achilleasgkekas/pharos.git
cd pharos
cp .env.example .env
```

This uses the default `docker-compose.yml`, which builds the `web` image locally.

---

## 3. Configure `.env`

Open `.env` and set the secrets. **Three values are required** and the app fails
closed without the auth ones.

Generate required secrets:

```bash
openssl rand -base64 32   # → AUTH_SECRET
openssl rand -base64 32   # → NEXT_SERVER_ACTIONS_ENCRYPTION_KEY
openssl rand -base64 24   # → MONGO_PASS
```

### Required variables

| Variable | Purpose |
|---|---|
| `AUTH_SECRET` | Signs the session cookie. If unset, nobody can log in. Rotating it logs everyone out. |
| `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` | Stable key so Server Action IDs survive rebuilds/restarts (keeps open tabs working). |
| `MONGO_USER` / `MONGO_PASS` | MongoDB root credentials. Baked into the data volume on **first** init only; changing later requires `db.changeUserPassword` on the running container. |

### Optional — connection & session

| Variable | Default | Purpose |
|---|---|---|
| `AUTH_COOKIE_SECURE` | `false` | Set `true` **only** when served over HTTPS. On plain-HTTP LAN/VPN, leaving it `false` allows login cookies to be set. |
| `SESSION_IDLE_HOURS` | `12` | Session timeout (hours) without activity; resets on each request. |
| `ME_USER` / `ME_PASS` | (none) | Basic-auth for the optional Mongo Express UI (`:8081`, `tools` profile). |

### Optional — AI providers

The app defaults to **local Ollama** (private, zero-cost). Cloud AI providers are optional; only configure if you want to use them. Keys are stored server-side and never sent to the browser.

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Claude API key (optional fallback; can also be set in Settings → AI) |
| `OPENAI_API_KEY` | OpenAI API key (optional; can also be set in Settings → AI) |
| `GEMINI_API_KEY` | Google Gemini API key (optional; can also be set in Settings → AI) |
| `OLLAMA_HOST` | Ollama server URL (default `http://localhost:11434`). Use a LAN URL to run inference on another machine. |
| `OLLAMA_MODEL` | Default text model (default `qwen2.5vl:7b`). Overridable in Settings → AI. |
| `OLLAMA_VISION_MODEL` | Default vision model for receipt/card images (default `qwen2.5vl:7b`). Overridable in Settings. |
| `OLLAMA_NUM_CTX` | Context window size (default `8192`). Larger fits bigger pages but uses more RAM. |
| `OLLAMA_KEEP_ALIVE` | How long Ollama keeps a model warm in RAM (default `30m`). |

### Optional — integration & scraping

| Variable | Purpose |
|---|---|
| `SEARXNG_URL` | SearXNG metasearch server for "AI fill from web" and product-photo lookup (default `http://searxng:8080` in compose). |
| `SOLVER_URL` | FlareSolverr endpoint for Cloudflare-protected shops (default `http://flaresolverr:8191` in compose). Only needed if using the `scraper` profile. |
| `SCRAPER_CRON` | Price-scraper schedule (cron format; default `0 */6 * * *` = every 6 hours). |
| `PRICE_DROP_ALERT_PCT` | Alert threshold for price drops (default `10` = 10% drop triggers alert). |
| `NTFY_URL` | ntfy server URL (default `https://ntfy.sh`). |
| `NTFY_TOPIC` | Topic name for push alerts. Empty disables alerts. |

### Optional — rate limiting

On a shared or public deployment, rate limit API calls to prevent brute-force login or runaway clients. Single-user self-hosted setups do not need this.

| Variable | Default | Purpose |
|---|---|---|
| `API_RATE_LIMIT` | (disabled) | Max requests per window (e.g. `120`). Empty or `0` disables rate limiting. |
| `API_RATE_WINDOW_MS` | `60000` | Time window for rate limiting (in milliseconds). `60000` = 1 minute. |

### SaaS-only (ignored in self-hosted)

**Self-hosted deployments should leave all of these blank.** These variables only matter when running the paid, multi-tenant SaaS version.

| Variable | Purpose |
|---|---|
| `SAAS_MODE` | Set to `"true"` to enable multi-tenant mode. Anything else keeps single-user mode (the default). |
| `SAAS_BASE_DOMAIN` | Apex domain for tenant subdomains (e.g. `ph-aros.com`). Default `ph-aros.com`. |
| `SAAS_PUBLIC_URL` | Public origin for links in transactional emails and Stripe redirects. Falls back to `APP_URL`, then the request origin. |
| `APP_URL` | Fallback app origin. |
| `SAAS_SESSION_IDLE_HOURS` | Session timeout for hosted accounts (default `12`). Clamped 0.25–8760 hours. |
| `SAAS_SUPERADMIN_EMAILS` | Comma/semicolon-separated allowlist of operator emails for the superadmin console. Empty disables the console. |
| `CRON_SECRET` | Shared secret (generate with `openssl rand -base64 32`) required to call internal cron endpoints (e.g. usage sampling). |
| `STRIPE_SECRET_KEY` | Stripe secret API key from the Stripe dashboard. |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret. |
| `STRIPE_PRICE_SHARED` | Stripe price ID for the shared-account tier (price_...). |
| `STRIPE_PRICE_DEDICATED` | Stripe price ID for the dedicated-account tier (price_...). |
| `RESEND_API_KEY` | Resend API key for transactional emails (verification, password reset, invites). |

> Never commit `.env`. It holds your database password and secrets.

If you use the prebuilt image and want to pin a version instead of `latest`, add
`PHAROS_IMAGE=ghcr.io/achilleasgkekas/pharos:1.2.3` to `.env`.

---

## 4. Start the stack

Prebuilt image:

```bash
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

From source:

```bash
docker compose up -d
```

Either way the base stack is three containers:

| Container | Image | Role |
|---|---|---|
| `homepage-web` | `ghcr.io/achilleasgkekas/pharos` (or locally built) | The Next.js app, on `:3000` |
| `homepage-mongo` | `mongo:7` | Database (metadata only) |
| `homepage-searxng` | `searxng/searxng` | Local metasearch for "AI fill without a link" + product photos |

Mongo starts with a healthcheck; the web service waits for it to be healthy.
Check status with `docker compose ps` and logs with
`docker compose logs -f web`.

---

## 5. First-run admin setup

Open **http://localhost:3000** (or your host's address). On first launch there is
no account yet, so PHAROS shows a **first-run setup wizard** that:

1. Creates your **admin** account (username + password). Passwords are hashed
   with `scrypt`; sessions are signed JWTs in an httpOnly cookie.
2. Lets you set basic preferences (currency, default VAT, etc.).
3. Optionally points you at an AI provider — you can skip this entirely and turn
   AI on later from **Settings → AI**.

After the wizard you're logged in. Add more household members (admin / member
roles) from **Settings**.

No AI key is required to use the app; every feature has a manual path.

---

## 6. Optional profiles

The base `up -d` starts only web + mongo + searxng. Extra services are opt-in via
Compose profiles. Use the same `-f docker-compose.prod.yml` flag if you started
from the prebuilt image.

**Price scraper + Cloudflare solver** (URL import / price tracking from
bot-protected shops like Skroutz):

```bash
docker compose --profile scraper up -d
# prebuilt image users: only FlareSolverr is available prebuilt —
docker compose -f docker-compose.prod.yml --profile scraper up -d flaresolverr
```

> The `scraper` worker itself builds from source, so from the prebuilt compose
> file only `flaresolverr` comes up. Run the full scraper from the dev
> `docker-compose.yml` if you need scheduled price scraping.

**Mongo Express** DB admin UI (basic-auth, `:8081`):

```bash
docker compose --profile tools up -d mongo-express
# or: docker compose -f docker-compose.prod.yml --profile tools up -d mongo-express
```

---

## 7. Storage & backups

**Binary files** (receipt images, statement PDFs, product photos) live on a
host-mounted volume, not in the database. The web container mounts
`./data/storage` to `/storage` (`STORAGE_ROOT=/storage`). MongoDB keeps only
metadata and references the files by path.

**Database data** lives in the named Docker volume `mongo-data`.

Back up both:

- **Database** — dump the `homepage` DB out of the running Mongo container. The
  repo ships `scripts/backup.sh`, a nightly gzipped `mongodump` with retention
  pruning. Point `BACKUP_DIR` at your NAS mount and schedule it via cron:

  ```bash
  # every night at 03:30
  30 3 * * * /path/to/pharos/scripts/backup.sh >> /tmp/pharos-backup.log 2>&1
  ```

  Restore with `scripts/restore.sh`.

- **Files** — back up the `./data/storage` directory (any file-level backup tool
  or a NAS sync works).

PHAROS also supports **in-app** safety nets: soft-delete Trash with 30-day
recovery, JSON data export/import from Settings, and optional SMB/FTP/OneDrive
mirroring of the storage bucket to a NAS or cloud drive. These complement, not
replace, the offline dump above (3-2-1 backups).

For the full picture — automating the nightly dump, restoring, the JSON/CSV
exports, the storage mirror, and Trash — see the dedicated
[Backup & restore](backup-and-restore.md) guide.

---

## 8. Updating

Prebuilt image:

```bash
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

New images are published to GHCR by the **Release image** workflow on every
`v*.*.*` tag. Pin a specific version with `PHAROS_IMAGE` in `.env` if you prefer
controlled upgrades.

From source:

```bash
git pull
docker compose up -d --build
```

> After any rebuild/upgrade, do a hard refresh (Ctrl/Cmd+Shift+R) in open tabs.
> A stable `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` keeps most Server Actions working
> across restarts, but changed code can still invalidate old bundles in a stale
> tab.

For version pinning, database migrations, post-upgrade checks, and rolling back,
see the dedicated [Updating](updating.md) guide.

---

## 9. Running behind HTTPS / a reverse proxy

PHAROS ships no TLS of its own and is designed to sit on a trusted network. For
remote access:

- Put it behind a **VPN** (WireGuard/Tailscale) or a **reverse proxy** that
  terminates TLS (Nginx Proxy Manager, Caddy, Traefik).
- When served over HTTPS, set `AUTH_COOKIE_SECURE=true` so the session cookie is
  marked Secure. On plain HTTP leave it `false`, or login will silently fail.
- All routes, including served files under `/api/files`, are gated by auth
  middleware — unauthenticated page requests are redirected and file/API
  requests get a 401.

See [SECURITY.md](../SECURITY.md) for the full security model.

---

## 10. Troubleshooting

**I can't log in / the login form just reloads.**
You're likely on plain HTTP with `AUTH_COOKIE_SECURE=true`. Set it to `false`
(or serve over HTTPS) and restart the web container. Also confirm `AUTH_SECRET`
is set — without it the app fails closed.

**`web` won't start, complains about a missing secret.**
The prod compose requires `AUTH_SECRET` and
`NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` in `.env` (it errors loudly if unset).
Generate them (section 3) and `up -d` again.

**Mongo authentication failed.**
`MONGO_PASS` is baked into the data volume on the **first** init only. If you
changed it after the volume already existed, either revert to the original
password or rotate it inside the container with `db.changeUserPassword`. A fresh
start (destroying the `mongo-data` volume) also re-bakes it, but that erases the
database.

**AI features say "offline" or don't parse.**
AI is optional and off until configured. Set a provider in **Settings → AI**. If
using local Ollama, make sure it's running on the host and reachable at
`http://host.docker.internal:11434` (the `extra_hosts` mapping in compose wires
the host gateway).

**URL import from Skroutz / Cloudflare-protected shops fails.**
Those need the FlareSolverr solver. Start the `scraper` profile (section 6).

**Everything is slow on first AI call.**
Local model warm-up. Subsequent calls are cached/warm. Cloud providers avoid
this at the cost of per-call spend.
