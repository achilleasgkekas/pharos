# Architecture

<sub>[📚 Docs home](README.md) · [✨ Features](features.md) · [🚀 Self-hosting](self-hosting.md) · [⚙️ Configuration](configuration.md) · [❓ FAQ](faq.md)</sub>

How the pieces of PHAROS fit together. This is a map for self-hosters who want to
understand what runs on their box, and for contributors finding their way around
the codebase. For running instructions see [Self-hosting](self-hosting.md); for the
REST surface see the [API reference](api.md).

## The short version

PHAROS is a **single Next.js 15 application** backed by **MongoDB**, packaged with
Docker Compose. Everything a user needs is those two services. A handful of extra
services (metasearch, a Cloudflare solver, a price scraper, a DB admin UI) are
**opt-in** and gated behind Compose profiles, so a minimal install stays small.

The web app serves three kinds of clients from one process:

- **The browser UI** — React Server Components + Server Actions, protected by a
  signed session cookie.
- **API clients** — a REST API under `/api/v1`, protected by a per-user bearer
  token, for scripts and other tools.
- **Optionally, other tools** — an MCP endpoint under `/api/mcp`.

AI is **optional** and lives outside the container: either a native Ollama on the
host, or a cloud provider reached over HTTPS. Nothing about the core app depends on
it being present.

## Deployment topology

```
                        host machine (Docker Desktop / Linux)
  ┌──────────────────────────────────────────────────────────────────────┐
  │                                                                        │
  │   homepage-web  ──────────►  homepage-mongo                            │
  │   (Next.js :3000)            (MongoDB 7, :27017 loopback only)         │
  │        │                                                               │
  │        │  volume: ./data/storage → /storage  (receipts, PDFs, photos) │
  │        │                                                               │
  │        ├──► searxng     (:8888 loopback)   web + image search          │
  │        ├──► flaresolverr (:8191 loopback)  Cloudflare solver  [scraper]│
  │        └──► (host gateway) ──► Ollama :11434  native, on the host      │
  │                                                                        │
  │   homepage-scraper  (price worker, cron)                     [scraper] │
  │   homepage-mongo-ui (mongo-express :8081 loopback)           [tools]   │
  │                                                                        │
  └──────────────────────────────────────────────────────────────────────┘
        ▲                         ▲
        │ :3000                   │ :3000 /api/v1 (+ /api/files) bearer token
   browser (session cookie)   API clients (scripts, MCP)
```

Only **`web`** binds to all interfaces (`0.0.0.0:3000`) so phones can reach it over
the LAN / WireGuard VPN. Every other published port is bound to `127.0.0.1`, so the
database, admin UI, solver, and metasearch never face the network. Containers talk
to each other over Compose's internal network by service name (`mongo`, `searxng`,
`flaresolverr`).

### Services and profiles

| Service | Container | Profile | Purpose |
|---|---|---|---|
| `web` | `homepage-web` | default | The Next.js app (UI + API). The only service most installs need. |
| `mongo` | `homepage-mongo` | default | MongoDB 7. Metadata store; binary files live on disk. |
| `searxng` | `homepage-searxng` | default | Self-hosted metasearch for "AI fill without a link" and product photos. |
| `scraper` | `homepage-scraper` | `scraper` | Node price-tracking worker on a cron (`SCRAPER_CRON`, default every 6h). |
| `flaresolverr` | `homepage-flaresolverr` | `scraper` | Headless-Chromium proxy that clears Cloudflare "Just a moment" challenges. |
| `mongo-express` | `homepage-mongo-ui` | `tools` | Optional DB admin UI on `:8081`. |

Start commands:

```bash
docker compose up -d                       # web + mongo + searxng
docker compose --profile scraper up -d     # + scraper + flaresolverr
docker compose --profile tools up -d mongo-express   # + DB admin UI
```

> The Docker **container** names (`homepage-web`, `homepage-mongo`, ...) predate the
> PHAROS rename and are kept as-is; renaming them would disrupt a running stack.

## The web application

The app lives in [`apps/web`](../apps/web) (Next.js 15, App Router, TypeScript
strict). It is built as a **standalone** production image; there is no separate
backend process.

### Two auth surfaces, one app

Authentication splits by client, enforced in [`middleware.ts`](../apps/web/src/middleware.ts)
(Edge runtime):

- **UI (session cookie).** The middleware verifies a signed session cookie (`jose`,
  keyed by `AUTH_SECRET`) on every non-API request and redirects to `/login` (or
  `/setup` on first run, when there are zero users) when it is missing. The session
  uses a sliding idle window: the cookie is re-issued past the halfway mark, so
  active use stays signed in while an idle session expires after
  `SESSION_IDLE_HOURS`.
- **API (bearer token).** Requests to `/api/*` never get an HTML redirect; they get
  a `401`. Each `/api/v1` route validates an `Authorization: Bearer <token>` header
  against a per-user `apiToken` (see [`lib/apiAuth.ts`](../apps/web/src/lib/apiAuth.ts)).
  API clients also fetch `/api/files/*` with the same bearer token.

The edge middleware deliberately does **not** touch MongoDB (it cannot at the edge):
first-run detection and token lookups happen in Node-runtime route handlers instead.

### Request flows

- **Browser UI** → React Server Components render pages; mutations go through
  **Server Actions** (not REST). Server Action IDs are encrypted with
  `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`, which is pinned so open browser tabs survive
  a rebuild. See [Troubleshooting](troubleshooting.md) for the "hard refresh after a
  rebuild" note.
- **API clients** → the REST API under [`app/api/v1`](../apps/web/src/app/api/v1)
  (items, receipts, expenses, statements, subscriptions, vouchers, tasks, calendar,
  reports, search, notifications, and more). Full list in the
  [API reference](api.md).
- **File serving** → `/api/files/*` streams binary files (receipt scans, statement
  PDFs, item photos) from the storage volume, behind the same auth.
- **MCP** → `/api/mcp` exposes an MCP endpoint for tool-based clients.

### Data layer

- **MongoDB** holds all structured data. The Mongoose models under
  [`models/`](../apps/web/src/models) map one-to-one to the product's concepts:
  `Item`, `ShoppingListItem`, `Receipt`, `Expense`, `Statement`, `Subscription`,
  `Voucher`, `Task`, `Store`, `Card`, plus infrastructure models `User`, `Job`
  (background AI jobs), `Notification`, `AppConfig` (a singleton settings document),
  `Conversation` and the legacy `Phase` model. Credentials are excluded from
  user-facing exports.
- **Binary files** live on disk, not in the database. Mongo stores only the path;
  the file sits under the `/storage` volume (`./data/storage` on the host). This is
  the "local-first" rule: the app always reads and serves files from local disk.
- **Soft delete.** Most records are removed reversibly. Deletes set `deletedAt`
  rather than dropping the document; a query middleware hides them, and the Settings
  → Trash view restores or permanently purges. See the [Glossary](glossary.md).

### Storage backends and mirror

Local disk is always the source of truth. A **remote backend** (SMB, FTP, or
OneDrive) can be configured as a **push-only mirror**: files are copied out for
backup, never read back for serving. See
[`lib/storage.ts`](../apps/web/src/lib/storage.ts),
[`lib/remoteStorage.ts`](../apps/web/src/lib/remoteStorage.ts),
[`lib/mirror.ts`](../apps/web/src/lib/mirror.ts), and
[Configuration → Storage](configuration.md).

## AI, on the side

AI is optional and per-feature. When enabled, the app dispatches to one of several
providers (Ollama, Anthropic, OpenAI, Gemini, OpenRouter, or a custom
OpenAI-compatible endpoint) from [`lib/aiConfig.ts`](../apps/web/src/lib/aiConfig.ts)
and `lib/aiProviders.ts`. In the reference setup, **Ollama runs natively on the host**
(Apple Neural Engine) and the container reaches it at
`http://host.docker.internal:11434` via the host gateway; no model runs inside Docker.

Feature gating lives in `lib/aiFeatures.ts` (client-safe registry) and
`lib/aiFeatures.server.ts` (server gating), so the UI can show what is on without
importing Node-only code. Heavy or bulk AI runs are queued as background `Job`
documents and processed in-process, surviving reloads and running cross-device.
Details in [Configuration → AI providers](configuration.md).

## Optional companions

- **searxng** — privacy-first metasearch used for AI enrichment (finding a product
  page from a name, fetching photos). Local, no API key.
- **flaresolverr + scraper** — the price-tracking path. The scraper worker walks
  tracked shopping items on a cron, fetches store pages (routing Cloudflare-protected
  shops like Skroutz through flaresolverr), extracts prices, appends price history,
  and can fire ntfy alerts on drops. Opt-in because the pair is heavy.
- **mongo-express** — a browser DB admin UI for debugging, bound to loopback.


## Where things live (quick map)

| Path | What |
|---|---|
| `apps/web/src/app` | Pages (RSC), Server Actions, and the `/api` routes. |
| `apps/web/src/app/api/v1` | The REST API for external clients and scripts. |
| `apps/web/src/models` | Mongoose schemas (the data model). |
| `apps/web/src/lib` | DB connection, auth, AI, storage, notifications, tenancy, billing. |
| `apps/web/src/components` | React UI components. |
| `apps/web/src/middleware.ts` | Edge auth gate (session cookie / bearer split). |
| `services/scraper` | The standalone price-tracking worker. |
| `docker-compose.yml` | The full stack, with `scraper` and `tools` profiles. |

## See also

- [Self-hosting](self-hosting.md) — get the stack running.
- [Configuration](configuration.md) — AI, storage, notifications, i18n.
- [API reference](api.md) — the `/api/v1` surface in detail.
- [Glossary](glossary.md) — Pharos-specific terms.
