# PHAROS documentation

PHAROS (Φάρος) is a self-hosted personal hub: inventory, receipts, expenses,
credit-card installments, subscriptions, vouchers, tasks — with **optional** AI
that reads your documents for you. It runs on your own hardware behind your own
login, and is available both as open source (AGPL-3.0) and as a hosted service.

This folder is the documentation set. It is plain Markdown so it renders on
GitHub today and can feed a docs site later.

## Guides

- **[Architecture](architecture.md)** — how the pieces fit: the Docker services and
  profiles, the two auth surfaces (session cookie vs bearer token), the data layer,
  optional AI/scraper/searxng companions, and the managed-SaaS overlay.
- **[Self-hosting](self-hosting.md)** — from an empty host to a running instance:
  prerequisites, Docker Compose, required env vars, first-run admin setup,
  storage & backups, updating, HTTPS, and troubleshooting.
- **[Features](features.md)** — what each module does from a user's perspective:
  Items/Shopping, Shopping list, Receipts + AI parsing, Expenses/Income,
  Statements/installments, Subscriptions, Vouchers, Calendar, Reports, Tasks,
  Network/UniFi, AI command bar, Search, Notifications, Trash, Settings.
- **[API reference](api.md)** — the REST API v1 under `/api/v1`: bearer-token
  auth, list envelope & incremental sync, and every endpoint (method, path,
  request/response shape), read from the route files. A machine-readable
  **[OpenAPI 3.1 spec](openapi.yaml)** mirrors the same 50 endpoints for
  Swagger UI, Postman, and client code generation.
- **[Configuration](configuration.md)** — AI providers, storage backends
  (local/SMB/FTP/OneDrive), notifications (ntfy/Discord/Slack/Telegram/webhook),
  and language (i18n).
- **[Security](security.md)** — the default threat model, the two auth surfaces
  (session cookie vs bearer token), rate limiting, built-in hardening, secrets,
  and the checklist to follow before exposing an instance to the internet.
- **[Backup & restore](backup-and-restore.md)** — the complete offline dump
  (database + files), automating the nightly `mongodump`, restoring, the in-app
  JSON/CSV exports, the remote storage mirror, and the Trash safety net.
- **[Updating](updating.md)** — moving an existing instance to a newer version:
  what persists, image tags & version pinning, whether migrations are needed,
  post-upgrade checks, and rolling back.
- **[Troubleshooting](troubleshooting.md)** — the most common problems in one
  place, grouped by area (startup, login, database, AI, storage, notifications,
  import, performance), each linking back to the guide that covers it.
- **[Managed SaaS mode](saas.md)** — the optional multi-tenant control plane
  (`SAAS_MODE`): accounts, workspaces, memberships & roles, the plan/quota
  ladder, the `/api/saas` control-plane API, Stripe billing, and its env vars.
  Does not apply to the self-hosted app.
- **[FAQ](faq.md)** — common questions grouped by topic: self-hosting vs managed
  SaaS, privacy & data ownership, AI, storage & backups, cost &
  licensing, and where to start when something breaks.
- **[Glossary](glossary.md)** — Pharos-specific terms in plain language: receipt
  status, installment signature/merge, vendorKey series, mirror, local-first,
  tenant/membership, price verdict, and more.
- **[Contributing to the docs](contributing-docs.md)** — the markdown-first
  convention, style rules, keeping `api.md` in sync with the route files, the
  link-check and fence-balance helpers, and the commit discipline.

## Reference (repo root)

- [README](../README.md) — project overview and quick start.
- [SECURITY.md](../SECURITY.md) — security model and reporting.
- [CONTRIBUTING.md](../CONTRIBUTING.md) — how to contribute.
- [API.md](../API.md) — current API notes.
- [ROADMAP.md](../ROADMAP.md) — direction and upcoming work.
- [LICENSE](../LICENSE) — AGPL-3.0.
