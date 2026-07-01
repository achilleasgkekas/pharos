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

## Planned guides

These are being written incrementally (see [DOCS_PROGRESS.md](DOCS_PROGRESS.md)):

- **Features** — what each module does from a user's perspective (Items/Shopping,
  Receipts + AI parsing, Expenses/Income, Statements/installments, Subscriptions,
  Vouchers, Calendar, Reports, Tasks, Network/UniFi, Settings).
- **Configuration** — AI providers, storage backends (local/SMB/FTP/OneDrive),
  notifications (ntfy/Discord/Slack/Telegram/webhook), i18n.
- **API reference** — the REST API v1 under `/api/v1` (auth, endpoints, shapes).
- **Mobile app** — Expo companion app setup and pointing it at a server.

## Reference (repo root)

- [README](../README.md) — project overview and quick start.
- [SECURITY.md](../SECURITY.md) — security model and reporting.
- [CONTRIBUTING.md](../CONTRIBUTING.md) — how to contribute.
- [API.md](../API.md) — current API notes.
- [ROADMAP.md](../ROADMAP.md) — direction and upcoming work.
- [LICENSE](../LICENSE) — AGPL-3.0.
