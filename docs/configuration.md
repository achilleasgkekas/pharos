# Configuration

Almost everything in Pharos is configured from the **Settings** page inside the
app (stored in the database, no restart needed). A handful of secrets and
infrastructure defaults come from environment variables at boot. This guide
covers the areas most people ask about:

- [AI providers](#ai-providers)
- [Storage backends](#storage-backends) (local / SMB / FTP / OneDrive)
- [Notifications](#notifications) (ntfy / Discord / Slack / Telegram / webhook)
- [Language (i18n)](#language-i18n)
- [Calendar feed](#calendar-feed) (subscribe from Google / Apple / Outlook)
- [Remote access (MCP / mobile app)](#remote-access-mcp--mobile-app)

For the full list of boot-time environment variables, see
[self-hosting.md](self-hosting.md).

---

## AI providers

Pharos is **fully usable with AI turned off**. AI adds document reading (parse a
receipt or statement into structured fields), specs enrichment, the natural-
language command bar, and similar helpers. Every AI feature can be toggled
individually, and there is a master switch, so nothing calls out to a model
unless you ask it to.

Configure this under **Settings → AI**.

### Supported providers

| Provider     | Kind        | Needs                                   |
|--------------|-------------|-----------------------------------------|
| `ollama`     | Local       | An Ollama server URL + a model name     |
| `anthropic`  | Cloud       | Anthropic (Claude) API key + model      |
| `openai`     | Cloud       | OpenAI API key + model                  |
| `gemini`     | Cloud       | Google Gemini API key + model           |
| `openrouter` | Cloud       | OpenRouter API key + model              |
| `custom`     | Cloud/Local | Any OpenAI-compatible base URL + model  |

The default provider is `ollama` (local, private, zero cost). Cloud API keys are
stored server-side only and are never sent to the browser.

### Local (Ollama)

Ollama runs the model on your own hardware. Pharos uses **two** model slots so a
smarter text-only model can drive statements/specs while a vision model reads
receipt images:

- **Text model** — statements, specs, subscriptions, the command bar.
- **Vision model** — receipt images and card scans (needs a vision-capable
  model such as `qwen2.5vl:7b`).

Boot-time defaults (overridable per-field in Settings):

- `OLLAMA_HOST` — the Ollama server URL. Empty falls back to
  `http://localhost:11434`. Use a LAN URL (e.g. `http://192.168.1.50:11434`) to
  run inference on another machine.
- `OLLAMA_MODEL` — default text model (`qwen2.5vl:7b` if unset).
- `OLLAMA_VISION_MODEL` — default vision model (`qwen2.5vl:7b` if unset).
- `OLLAMA_NUM_CTX` — context window (default `8192`). Larger fits bigger pages
  but uses more RAM; the small Ollama default truncates large pages and can
  break JSON parsing.

From Settings you can pick the active model from what is installed, and pull new
models on demand.

### Cloud providers

For `anthropic`, `openai`, `gemini`, or `openrouter`, paste the API key and a
model id in the matching Settings panel. For `custom`, provide a **base URL**
(any OpenAI-compatible server such as LM Studio, Groq, Mistral, DeepSeek, or a
vLLM host), an optional key, and a model.

`ANTHROPIC_API_KEY` can also be supplied as an environment variable as a
fallback for the Anthropic key.

> **Fail-safe:** if the selected provider is half-configured (e.g. `anthropic`
> chosen but no key, or `custom` chosen without a base URL/model), Pharos falls
> back to `ollama` rather than erroring.

### Cost guard

`aiConfirmBulk` (on by default) asks for confirmation, with a rough cost
estimate, before starting any **bulk** AI job — so a large cloud run never
starts by accident.

### Editable prompts and scraper AI

- **Prompts** — every AI query (receipt, statement, product, card, subscription,
  category, voucher, price) has an editable prompt override under Settings → AI.
  An empty override uses the built-in default.
- **Scraper AI** — the price scraper has its own provider/model settings
  (`scraperProvider`, `scraperModel`), independent of the main AI, so you can
  keep scraping local while the main app uses a cloud model (or vice-versa).

---

## Storage backends

Receipts, statement PDFs, and item photos are binary files. Pharos always keeps
a **local working copy** (used for serving, thumbnails, and AI) and can, in
addition, **mirror** those files to a remote backend for off-box backup.

Configure this under **Settings → Storage & backup**.

### Backend options (`storageBackend`)

| Value      | What it is                                             |
|------------|--------------------------------------------------------|
| `local`    | Local disk only (the default). No remote.              |
| `smb`      | SMB/CIFS share (NAS). Uses the `smbclient` CLI (SMB3). |
| `ftp`      | FTP or FTPS (explicit TLS via `remoteSecure`).         |
| `onedrive` | Microsoft OneDrive via Microsoft Graph.                |

`storageMirror` (a toggle) also pushes a copy to the remote when a receipt is
verified, in addition to the manual **Sync now** action.

### SMB / FTP fields

- `remoteHost`, `remotePort` (`0` = backend default: 21 FTP / 445 SMB)
- `remoteUser`, `remotePass` (password is server-only, never sent to the client)
- `remoteShare` — SMB share name
- `remoteBasePath` — a prefix directory on the remote
- `remoteSecure` — FTPS (explicit TLS) for the FTP backend

Use **Test connection** in Settings to verify credentials before syncing. SMB
uses the Samba `smbclient` CLI (so it speaks SMB3, which pure-JS libraries do
not) with the password passed via environment, not on the command line.

### OneDrive

OneDrive uses **device-code OAuth**, ideal for a self-hosted box with no public
redirect URL. It works **zero-config**: Pharos ships with a public Microsoft
Graph client id, so you do not have to register an Azure app — just **Connect →
sign in**. (An advanced "use your own app" option accepts your own
`onedriveClientId`.)

- Sign-in is against the `consumers` tenant (personal Microsoft accounts /
  personal OneDrive).
- Pharos stores only the client id and the rotating refresh token
  (`onedriveRefreshToken`), both server-side.
- Uploads land under **`/Apps/Pharos/…`** in your drive.

### Naming and folder templates

The remote layout is driven by two templates (Settings → Storage):

- `folderTemplate` — default `{kind}/{year}/{month}`
- `fileNameTemplate` — default `{date}_{store}_{id}`

Available tokens: `{kind}` `{store}` `{year}` `{month}` `{day}` `{date}`
`{total}` `{id}` `{original}` `{ext}`. Token values are sanitised per path
segment (illegal characters stripped, spaces to underscores), so a store name
can never inject a path.

---

## Notifications

Alerts (price-drop deals, installments due this month, warranties expiring) fan
out to **every enabled channel**. All channels are plain HTTP POSTs, so no extra
dependency is required. Email is reachable through a generic webhook
(Zapier/Make/n8n) or a self-hosted relay.

Configure channels under **Settings → Notifications**. Each channel is an entry
in `notifiers` with `{ id, type, enabled, label, url?, token?, target? }`.

### Channel types

| Type       | Field(s) used            | Notes                                             |
|------------|--------------------------|---------------------------------------------------|
| `ntfy`     | `url`                    | e.g. `https://ntfy.sh/your-topic` or self-hosted. |
| `discord`  | `url`                    | Discord webhook URL. Title bold, then message.    |
| `slack`    | `url`                    | Slack incoming-webhook URL.                       |
| `telegram` | `token` + `target`       | Bot token + chat id.                              |
| `webhook`  | `url`                    | POSTs JSON `{ title, message, ts }`.              |

Use **Test** on a channel to send a one-off "Notifications are working" message
before relying on it. ntfy titles are ASCII-only; message bodies keep unicode
(e.g. Greek).

> The legacy single-channel fields (`ntfyUrl`, `ntfyEnabled`) still work and are
> migrated into `notifiers` the first time you save from Settings.

### Scraper price-drop alerts

The opt-in price scraper has its own ntfy alert path via environment variables
(see [self-hosting.md](self-hosting.md)):

- `NTFY_URL` (default `https://ntfy.sh`), `NTFY_TOPIC` (empty = disabled)
- `PRICE_DROP_ALERT_PCT` (default `10`) — alert threshold vs the lowest known
  price.

---

## Language (i18n)

The UI is translated into eight LTR European languages. English is the source
and the fallback for any missing string.

| Code | Language    |
|------|-------------|
| `en` | English     |
| `el` | Ελληνικά    |
| `es` | Español     |
| `fr` | Français    |
| `de` | Deutsch     |
| `it` | Italiano    |
| `pt` | Português   |
| `nl` | Nederlands  |

The choice is stored in the `pharos_locale` cookie (default `en`). Pick a
language from the app; there is no environment variable to set — it is per
browser/session.

> Currency and VAT are separate from language: set the display currency
> (`currency`, ISO 4217, default `EUR`) and the fallback VAT/sales-tax rate
> (`defaultVatRate`, default `24`) under Settings → General. Currency changes the
> displayed symbol only; it does not convert stored amounts.

---

## Calendar feed

Pharos can publish your money agenda (the next three months of subscription
renewals, card installments, projected recurring bills/income, and warranty /
voucher expiries) as a read-only [iCal / RFC 5545](https://datatracker.ietf.org/doc/html/rfc5545)
feed. Subscribe to it once from Google, Apple, or Outlook Calendar and those
events show up alongside the rest of your calendar, refreshing automatically.

### Get your subscribe URL

1. Open **Settings → AI** in the web app and find the **Calendar feed** section.
2. Click **Generate** (labelled **Rotate** if you already have one). A subscribe
   URL appears in the form:

   ```
   https://your-pharos-host/api/calendar.ics?token=<calendarToken>
   ```

3. Click the copy button next to it.

The token in the URL is a **dedicated low-scope, revocable secret**
(`User.calendarToken`), separate from your API bearer (`phk_…`) token. It grants
access to nothing except this read-only agenda feed, so pasting the subscribe URL
into a calendar app never exposes the rest of your data. If a URL leaks, click
**Rotate** to invalidate it (old subscriptions stop working immediately) or
**Revoke** to turn the feed off entirely.

> The token rides in the URL on purpose: calendar clients cannot send an
> `Authorization` header, so there is no other way to authenticate a subscription.
> Keep the URL private and prefer HTTPS in production.

### Subscribe from a calendar client

The URL must be reachable from the device running the calendar app. On a LAN or
over your VPN, `http://…` works; over the public internet, put Pharos behind
HTTPS first (see [self-hosting.md](self-hosting.md)).

- **Google Calendar** (web): left sidebar → **Other calendars** → **+** → **From
  URL** → paste the subscribe URL → **Add calendar**. Google refreshes external
  feeds on its own schedule (typically several hours), not on demand.
- **Apple Calendar** (macOS): **File → New Calendar Subscription…** → paste the
  URL → **Subscribe** → set **Auto-refresh** (e.g. every hour). On iPhone/iPad:
  **Settings → Calendar → Accounts → Add Account → Other → Add Subscribed
  Calendar**.
- **Outlook** (web): **Calendar → Add calendar → Subscribe from web** → paste the
  URL → name it → **Import**.

The feed advertises a 12-hour refresh hint (`X-PUBLISHED-TTL`); each client
ultimately decides how often it polls. To confirm the feed works before
subscribing, fetch it directly:

```bash
curl -s "https://your-pharos-host/api/calendar.ics?token=YOUR_CALENDAR_TOKEN"
```

The endpoint itself is documented in [api.md](api.md#calendar-feed-ical).

---

## Remote access (MCP / mobile app)

Pharos exposes a remote [Model Context Protocol](https://modelcontextprotocol.io)
server so an external Claude client (the companion mobile app, Claude Code, or the
MCP Inspector) can drive it with the same tools as the in-app AI command bar (add /
update / search records, get an overview, and so on).

### Generate an API token

1. Open **Settings → AI** in the web app and find the mobile / remote-access
   section.
2. Click **Generate** to mint a personal API token (`phk_…`). It is shown **once**,
   right after generation, so copy it immediately; you can **Revoke** and generate
   a new one at any time.
3. Note the connector URL shown next to it:

   ```
   https://your-pharos-host/api/mcp
   ```

Unlike the calendar feed token, this **is** the full API bearer: it is the same
token the [REST API](api.md) and the [mobile app](mobile.md) use, sent as
`Authorization: Bearer phk_…`. Treat it like a password.

### Connect a client

- **Mobile app** — enter the server URL and paste the token; see
  [mobile.md](mobile.md).
- **Claude Code** — add it as a remote MCP server pointing at
  `https://your-pharos-host/api/mcp` with the bearer token above.
- **Anything MCP-aware** — the transport is JSON-RPC 2.0 over Streamable-HTTP
  (tools only, plain-JSON responses). The wire protocol and every method are
  documented in [api.md](api.md#mcp-server-model-context-protocol).

Quick smoke test that the token and endpoint are live:

```bash
curl -s https://your-pharos-host/api/mcp \
  -H "Authorization: Bearer phk_YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

---

See also: [self-hosting.md](self-hosting.md) · [features.md](features.md) ·
[api.md](api.md) · [mobile.md](mobile.md)
