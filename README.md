<div align="center">

# 🗼 PHAROS

**Personal Hub · Asset & Resource Oversight System**

*One light over everything you run.*

Self-hosted personal infrastructure hub: inventory, receipts, expenses, credit-card
installments, subscriptions, vouchers, tasks, network monitoring, and an AI command
bar, all in one private dashboard.

</div>

---

## What it is

PHAROS is a single, private dashboard for everything you own and spend. Drop in a
receipt photo or a bank statement PDF and AI reads the vendor, amount, VAT, line
items, and installment plans. Track your gear, what you still want to buy (with
multi-store price tracking), recurring bills, warranties, and your home network,
all without sending a byte to anyone but the AI provider you choose.

It runs entirely on your own hardware (developed on a Mac mini M4, destined for a
Proxmox LXC) and is reached over WireGuard, so there is no public surface.

## Highlights

- **AI receipt & statement parsing** — drop a PDF/photo, AI extracts store, date,
  total, net/VAT, line items, and credit-card installment plans. OCR fallback with
  auto-rotation for sideways phone photos.
- **Inventory & shopping** — what you own vs. what you want, with multi-store price
  tracking, target-price deal alerts, price-history charts, and URL import (paste a
  product link → AI fills specs, photos, price, dedups against existing items).
- **Expenses & income** — recurring-series detection, statistical anomaly flags
  (a bill 2× its usual gets a ⚠ badge), per-category monthly budgets.
- **Statements & installments** — parses Greek/EU bank statements, correlates
  installment plans to the products you bought, tracks payoff across months.
- **Money calendar** — one 3-month agenda of renewals, installments, bills, and
  warranty/voucher expiries.
- **Network** — live read-only view of your UniFi gateway (WAN, devices, clients,
  temperatures) with ntfy alerts when a device goes offline.
- **AI command bar** — "add a Netflix subscription", "show this month's stats" in
  plain language; conversational, asks for confirmation when unsure.
- **Built for safety** — soft-delete Trash (30-day recovery), nightly backups,
  SMB/FTP mirroring to a NAS, full data export/import.

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15 (App Router, RSC, Server Actions, TypeScript strict) |
| Database | MongoDB 7 + Mongoose 8 |
| UI | Tailwind CSS v4, Recharts, lucide-react |
| AI | Pluggable: Ollama (local), Anthropic, OpenAI, Gemini, OpenRouter, or any OpenAI-compatible server |
| Validation | Zod |
| Containers | Docker Compose (web + Mongo + SearXNG; scraper & tools opt-in) |
| Scraping | Playwright worker + FlareSolverr (Cloudflare), node-cron |

## Quick start

```bash
cp .env.example .env          # fill in Mongo creds, etc.
docker compose up -d          # web + mongo + searxng
open http://localhost:3000
```

Other profiles:

```bash
docker compose --profile scraper up -d   # + price scraper + FlareSolverr
docker compose --profile tools up -d mongo-express   # DB admin UI on :8081
```

Local dev (outside Docker):

```bash
cd apps/web
npm install
npm run dev        # http://localhost:3000
npm run type-check # tsc --noEmit
```

## AI providers

PHAROS works with whatever AI backend you prefer. Pick one in **Settings → AI**:

- **Ollama** — fully local, private, free (e.g. `qwen2.5vl:7b` for vision +
  `qwen2.5:14b` for text). Configurable URL, so the model can run on another box.
- **Anthropic** — Claude, the strongest parsing. Required for the AI command bar.
- **OpenAI · Gemini · OpenRouter** — cloud, vision-capable.
- **Custom** — any OpenAI-compatible server (LM Studio, Groq, Mistral, DeepSeek,
  vLLM…). Just point it at a base URL.

A half-configured provider transparently falls back to Ollama, so parsing never
hard-fails. Every built-in prompt is editable from Settings.

## Storage & backups

- Binary files (receipt images, statement PDFs) live on local disk; metadata in
  Mongo references them by path.
- **Remote mirror** — optionally push every verified file to a NAS over SMB3 or
  FTP/FTPS (`Settings → Storage`). Auto-mirror on verify, or "Sync now" in bulk.
- **Backups** — `scripts/backup.sh` does a gzipped `mongodump`; a launchd agent
  runs it nightly to `~/Backups/pharos`. Full JSON export/import in Settings.
- **Trash** — deletes are soft (recoverable for 30 days) from Settings → Storage.

## Project structure

```
homepage/
├── docker-compose.yml          # web + mongo + searxng (+ scraper/tools profiles)
├── scripts/                    # backup.sh, migrate.ts, seed, mongo-init.js
├── apps/web/                   # Next.js app
│   └── src/
│       ├── app/                # routes: items, shopping, receipts, expenses,
│       │                       #   income, statements, subscriptions, vouchers,
│       │                       #   tasks, reports, calendar, network, settings
│       ├── components/         # UI primitives + SiteNav, AiCommandBar
│       ├── lib/                # db, ollama/anthropic/aiProviders, ocr, pdf,
│       │                       #   unifi, mirror, softDelete, money, …
│       └── models/             # Mongoose schemas
└── services/scraper/           # standalone price-scraper worker (cron)
```

## Security model

- No public access. Reached over WireGuard only; no auth layer by design.
- API keys and remote passwords are stored server-side and never sent to the client.
- Network integration uses a read-only local UniFi user, never your cloud account.
- Untrusted email-HTML receipts are served with `script-src 'none'` + `nosniff`.

---

<div align="center">
<sub>Private project. Built with Next.js, MongoDB, and a lighthouse. 🗼</sub>
</div>
