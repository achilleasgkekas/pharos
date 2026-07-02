# PHAROS documentation

PHAROS (Φάρος) is a self-hosted personal hub: inventory, receipts, expenses,
credit-card installments, subscriptions, vouchers, tasks — with **optional** AI
that reads your documents for you. It runs on your own hardware behind your own
login, and is available both as open source (AGPL-3.0) and as a hosted service.

This folder is the documentation set. It is plain Markdown so it renders on
GitHub today and can feed a docs site later.

## Guides

- **[Self-hosting](self-hosting.md)** — from an empty host to a running instance:
  prerequisites, Docker Compose, required env vars, first-run admin setup,
  storage & backups, updating, HTTPS, and troubleshooting.
- **[Features](features.md)** — what each module does from a user's perspective:
  Items/Shopping, Shopping list, Receipts + AI parsing, Expenses/Income,
  Statements/installments, Subscriptions, Vouchers, Calendar, Reports, Tasks,
  Network/UniFi, AI command bar, Search, Notifications, Trash, Settings.
- **[API reference](api.md)** — the REST API v1 under `/api/v1`: bearer-token
  auth, list envelope & incremental sync, and every endpoint (method, path,
  request/response shape), read from the route files.
- **[Configuration](configuration.md)** — AI providers, storage backends
  (local/SMB/FTP/OneDrive), notifications (ntfy/Discord/Slack/Telegram/webhook),
  and language (i18n).
- **[Mobile app](mobile.md)** — the Expo iOS/Android companion: install, point it
  at your Pharos server, sign in for a bearer token, camera AI scans, push, and
  building installable binaries with EAS.
- **[Troubleshooting](troubleshooting.md)** — the most common problems in one
  place, grouped by area (startup, login, database, AI, storage, notifications,
  import, mobile, performance), each linking back to the guide that covers it.

## Reference (repo root)

- [README](../README.md) — project overview and quick start.
- [SECURITY.md](../SECURITY.md) — security model and reporting.
- [CONTRIBUTING.md](../CONTRIBUTING.md) — how to contribute.
- [API.md](../API.md) — current API notes.
- [ROADMAP.md](../ROADMAP.md) — direction and upcoming work.
- [LICENSE](../LICENSE) — AGPL-3.0.
