<div align="center">

<img src="banner.png" alt="PHAROS - Personal Hub, Asset and Resource Oversight System" width="100%">

# Documentation

**Everything you need to run PHAROS (Φάρος) on your own server and get the most out of it.**

*Inventory · receipts · expenses · bills · subscriptions · statements · utilities · vehicles · documents, with optional AI.*

[Project README](../README.md) · [Features](features.md) · [Self-hosting](self-hosting.md) · [API](api.md) · [FAQ](faq.md)

</div>

---

PHAROS is a self-hosted personal hub for a household: what you own, what you
spend, and the papers and dates that keep it running. It runs on your own
hardware behind your own login, under the AGPL-3.0 license. AI is **optional**:
every core workflow has a manual path.

These guides are plain Markdown, so they read the same on GitHub and in any editor.

## Start here

| | Guide | What you'll find |
| :---: | --- | --- |
| 🚀 | **[Self-hosting](self-hosting.md)** | From an empty host to a running instance: prerequisites, Docker Compose, required env vars, first-run setup, storage, HTTPS. |
| ✨ | **[Features](features.md)** | A tour of every module from a user's point of view: accounts & roles, inventory and shopping (with the shopping-country filter), receipts, expenses & income, statements, subscriptions, bills, utilities, vehicles, vouchers, documents, special dates, calendar, savings, reports, tasks, AI, search, notifications, backup, Trash and settings. |
| ⚙️ | **[Configuration](configuration.md)** | AI providers, storage backends (local / SMB / FTP / OneDrive), notifications (ntfy, Discord, Slack, Telegram, web push, webhooks), languages, the calendar feed and MCP. |

## Keep it running

| | Guide | What you'll find |
| :---: | --- | --- |
| 💾 | **[Backup & restore](backup-and-restore.md)** | The complete offline dump (database + files), nightly `mongodump`, restoring, the in-app JSON/CSV exports, the storage mirror and the Trash safety net. |
| ⬆️ | **[Updating](updating.md)** | Moving to a newer version: what persists, image tags and pinning, migrations, post-upgrade checks and rolling back. |
| 🛠️ | **[Troubleshooting](troubleshooting.md)** | The most common problems grouped by area (startup, login, database, AI, storage, notifications, import, performance). |
| 🔒 | **[Security](security.md)** | The threat model, the two auth surfaces (session cookie vs bearer token), rate limiting, hardening, secrets and the checklist before exposing an instance. |

## Build on it

| | Guide | What you'll find |
| :---: | --- | --- |
| 🧭 | **[Architecture](architecture.md)** | How the pieces fit: Docker services and profiles, auth, the data layer, and the optional AI, scraper and SearXNG companions. |
| 🔌 | **[API reference](api.md)** | The REST API under `/api/v1`: bearer-token auth, the list envelope, incremental sync and every endpoint. The **[OpenAPI 3.1 spec](openapi.yaml)** covers the same 85 operations for Swagger UI, Postman and code generation. |
| 🧩 | **[Browser extension](../apps/extension/README.md)** | The Chrome extension that sends any product page to your inventory or shopping list. |

## Look it up

| | Guide | What you'll find |
| :---: | --- | --- |
| ❓ | **[FAQ](faq.md)** | Common questions: self-hosting, privacy and data ownership, AI, storage and backups, cost and licensing. |
| 📖 | **[Glossary](glossary.md)** | PHAROS terms in plain language: receipt status, installment signature, vendorKey, space, market, role, mirror and more. |
| ✍️ | **[Contributing to the docs](contributing-docs.md)** | The Markdown-first convention, style rules, keeping `api.md` in sync, and the link and fence checks. |

## In the repository root

- [README](../README.md): project overview and quick start
- [SECURITY.md](../SECURITY.md): security model and how to report a problem
- [CONTRIBUTING.md](../CONTRIBUTING.md): how to contribute code
- [API.md](../API.md): API notes
- [ROADMAP.md](../ROADMAP.md): direction
- [LICENSE](../LICENSE): AGPL-3.0
