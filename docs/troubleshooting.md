# Troubleshooting

<sub>[📚 Docs home](README.md) · [✨ Features](features.md) · [🚀 Self-hosting](self-hosting.md) · [⚙️ Configuration](configuration.md) · [❓ FAQ](faq.md)</sub>

A single place for the most common problems, grouped by area. Each item links
back to the guide that covers the topic in depth. If something here contradicts a
guide, the guide is authoritative — this page is a fast index.

- [Install & startup](#install--startup)
- [Login & authentication](#login--authentication)
- [Database (MongoDB)](#database-mongodb)
- [AI parsing & scans](#ai-parsing--scans)
- [Storage & backups](#storage--backups)
- [Notifications](#notifications)
- [Import & price scraping](#import--price-scraping)
- [Performance](#performance)

---

## Install & startup

**`web` won't start, complains about a missing secret.**
The production compose requires `AUTH_SECRET` and
`NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` in `.env` (it errors loudly if either is
unset). Generate them and bring the stack up again. See
[Self-hosting → Environment variables](self-hosting.md).

**Which services should be running?**
The default stack is three containers: `web`, `mongo`, and `searxng` (the last
powers "AI fill from web"). `flaresolverr` and `scraper` are opt-in via the
`scraper` Compose profile; `mongo-express` is opt-in via the `tools` profile.
`docker compose ps` lists what is up.

**A page shows "application error" right after I updated the image.**
An open browser tab holding a stale bundle can reference server actions that no
longer exist. Hard-refresh the page (Cmd/Ctrl+Shift+R). The app also detects
stale deploys and offers a reload.

---

## Login & authentication

**I can't log in / the login form just reloads.**
You are likely on plain HTTP with `AUTH_COOKIE_SECURE=true`, so the browser
refuses the secure session cookie. Set `AUTH_COOKIE_SECURE=false` (or serve over
HTTPS) and restart the `web` container. Also confirm `AUTH_SECRET` is set —
without it the app fails closed. See [Self-hosting](self-hosting.md).

**First run: there is no account yet.**
The first visit runs an admin setup wizard. Create the initial admin there, then
sign in. Details in [Self-hosting → First-run setup](self-hosting.md).

**API requests return 401.**
The REST API uses a bearer token (`phk_…`) issued on login and shown in
**Settings**. A regenerated token invalidates the old one — sign out and back
in on any client using it. See [API reference](api.md).

---

## Database (MongoDB)

**Mongo authentication failed.**
`MONGO_USER` / `MONGO_PASS` are baked into the `mongo-data` volume on the
**first** init only. If you changed them after the volume already existed, either
revert to the original values or rotate the password inside the container with
`db.changeUserPassword`. Destroying the `mongo-data` volume re-bakes the
credentials on next start, but that also erases the database — back up first.

---

## AI parsing & scans

**AI features say "offline" or don't parse.**
AI is optional and off until configured. Pick a provider in **Settings → AI**.
For local Ollama, make sure it is running on the host and reachable at
`http://host.docker.internal:11434` (the `extra_hosts` host-gateway mapping in
compose wires this). See [Configuration → AI providers](configuration.md).

**Receipt / statement scans return an error.**
The relevant AI feature must be configured and enabled on the server. Cloud
providers need a valid API key; local Ollama needs the model pulled. See
[Configuration](configuration.md).

**Greek (or other non-Latin) receipts parse poorly on a local model.**
Vision quality varies by model; a cloud vision model is more accurate at the cost
of per-call spend. See [Configuration → AI providers](configuration.md).

---

## Storage & backups

**Files open but a remote sync (SMB/FTP/OneDrive) does nothing.**
Local disk is always the working copy; remote backends are a mirror/backup. Use
**Settings → Storage & backup → Test connection**, then **Sync now**. For SMB3
NAS shares the app uses the `smbclient` CLI; check the exact error message
mapping in [Configuration → Storage backends](configuration.md).

**Where do backups go?**
Nightly backups and manual JSON export/restore are described in
[Self-hosting → Storage & backups](self-hosting.md).

---

## Notifications

**No alerts arrive.**
Notifications are opt-in per channel (ntfy/Discord/Slack/Telegram/webhook).
Configure and enable a channel in **Settings → Notifications**, then use the test
button. See [Configuration → Notifications](configuration.md).

---

## Import & price scraping

**URL import from Skroutz / Cloudflare-protected shops fails.**
Those shops need the FlareSolverr solver. Start the `scraper` Compose profile so
`flaresolverr` comes up, and confirm `SOLVER_URL` points at it. Non-protected
shops import without it. See [Self-hosting](self-hosting.md).

**Big product pages return truncated / invalid JSON on a local model.**
Increase the model context window (`OLLAMA_NUM_CTX`). See
[Configuration](configuration.md).

---

## Performance

**Everything is slow on the first AI call.**
Local models warm up on first use; subsequent calls are warm/cached. Cloud
providers avoid the warm-up at the cost of per-call spend.

**First Settings load is briefly slow with a local provider.**
The app probes local Ollama health on load, then caches the result. This is a
one-time delay after a restart or config change.

---

## See also

- [Docs index](README.md)
- [Self-hosting](self-hosting.md)
- [Configuration](configuration.md)
- [Features](features.md)
- [API reference](api.md)
