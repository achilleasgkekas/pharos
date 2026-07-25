# Pharos REST API (v1)

A token-authenticated JSON API for building a mobile/external client (Android, iOS, …).
Pharos is a shared-data household app, so the API runs against the same shared data as the web app.

**Base URL:** `https://<your-host>/api/v1`
To reach it from a phone, expose Pharos over public HTTPS via a tunnel (Cloudflare Tunnel / Tailscale Funnel) — see **Settings → Mobile / MCP**. On the LAN it's `http://<host>:3000/api/v1`.

All responses are JSON. Errors are `{ "error": "message" }` with an appropriate HTTP status.

## Auth

**Login** — `POST /api/v1/auth/login`

```jsonc
// body
{ "username": "you", "password": "•••" }
// 200
{ "token": "phk_…", "user": { "id": "…", "name": "…", "username": "…", "role": "admin|member" } }
```

Store the token and send it on **every other request**:

```
Authorization: Bearer phk_…
```

Missing/invalid token → `401`. The same token can be generated or revoked in **Settings → Mobile / MCP** (it's shared with the MCP connector).

## List params (pagination & sync)

Every list endpoint accepts:

- `limit` (1–200, default 50) and `offset` (default 0) — page window.
- `updatedSince=<ISO date>` — return only records with `updatedAt >= it`. **When present, soft-deleted records are also returned, flagged `"deleted": true`**, so an incremental sync can drop locally-removed rows. Without it, deleted records are hidden.

List responses are wrapped: `{ "data": [ … ], "total": N, "limit": L, "offset": O }` (the **items** endpoint keeps its `items` key for back-compat but adds `total/limit/offset`). Every record includes `updatedAt`.

**Sync loop:** keep the max `updatedAt` you've seen; next pull `?updatedSince=<that>` and apply creates/updates, removing any row with `deleted:true`.

## Endpoints

### Dashboard
`GET /api/v1/overview`
→ `{ counts: { items, shoppingList, receipts, expenses, subscriptions, openTasks }, installmentsOwed, activeInstallmentPlans, currency }`

### Items (product tracker / inventory)
- `GET /api/v1/items?status=shopping|inventory|all` (+ list params)
  → `{ items: [{ id, num, title, status, category, currentPrice, purchasedPrice, targetPrice, specs, warrantyUntil, tags, photo, updatedAt, deleted }], total, limit, offset }`
- `POST /api/v1/items` `{ title, status?, category?, currentPrice? }` → `{ item }`
- `PATCH /api/v1/items/:id` `{ title?, status?, category?, currentPrice?, targetPrice?, specs?, tags? }` → `{ item }`
- `DELETE /api/v1/items/:id` → `{ ok }` (soft-delete → Trash)

### Tasks
- `GET /api/v1/tasks?status=todo|in-progress|done|blocked` (+ list params) → `{ data: [{ id, title, status, priority, tags, content, dueDate, completedAt, updatedAt, deleted }], total, limit, offset }`
- `POST /api/v1/tasks` `{ title, status?, priority?, tags?, content?, dueDate? }` → `{ task }`
- `PATCH /api/v1/tasks/:id` `{ title?, status?, priority?, tags?, content?, dueDate? }` → `{ task }` (status `done` sets `completedAt`)
- `DELETE /api/v1/tasks/:id` → `{ ok }`

### Expenses & income
- `GET /api/v1/expenses?kind=expense|income` (+ list params) → `{ data: [{ id, kind, vendor, category, amount, currency, origAmount, fxRate, date, period, recurring, recurringCycle, paymentMethod, notes, file, thumb, verified, updatedAt, deleted }], total, limit, offset }`
  - `amount` is ALWAYS in the deployment's base currency (Settings → Currency), so a client can sum it without conversion. On a foreign-currency document, `origAmount` is the amount as printed and `fxRate` is base units per 1 unit of `currency` (`amount = origAmount * fxRate`). Both are `0` for an ordinary entry. `fxRate: 0` with a foreign `currency` means no rate is known yet, so `amount` is still the printed number: show it as unconverted rather than mixing it into a base-currency total.
- `POST /api/v1/expenses` `{ vendor, amount, kind?, date?, category?, period?, recurring?, recurringCycle?, notes? }` → `{ expense }` (groups into the vendor's recurring series automatically)

### Subscriptions
- `GET /api/v1/subscriptions?active=1` (+ list params) → `{ data: [{ id, name, provider, category, amount, currency, billingCycle, startDate, nextRenewal, active, paymentMethod, url, notes, updatedAt, deleted }], total, limit, offset }`
- `POST /api/v1/subscriptions` `{ name, amount, billingCycle?, startDate?, nextRenewal?, category?, provider?, url? }` → `{ subscription }`

### Receipts (read)
- `GET /api/v1/receipts?store=&archived=1` (+ list params) → `{ data: [{ id, store, date, total, subtotal, vatAmount, currency, paymentMethod, warrantyMonths, itemCount, verified, archived, file, thumb, updatedAt, deleted }], total, limit, offset }`
- `GET /api/v1/receipts/:id` → `{ receipt: { …, notes, lineItems: [{ name, qty, price, vatRate }] } }`

Creating a receipt is file-based (upload + AI scan); a multipart `scan/receipt` endpoint is the next addition (mirrors `scan/product`).

### AI scan (mobile camera)
- `POST /api/v1/scan/product` — multipart, field **`file`** = product photo
  → `{ data: { name, brand, category, quantity, notes } }`
  *Suggestion only* (no save); have the user confirm, then `POST /api/v1/shopping-list`.
- `POST /api/v1/scan/receipt` — multipart, field **`file`** = receipt image/PDF
  → `201 { receipt: { …, lineItems, aiUsed, aiError } }`
  **Saves + parses + creates** the receipt (mirrors the web dropzone). The user can fix fields later via `PATCH` on the web, or just keep it.

### Barcode lookup (mobile scanner)
- `GET /api/v1/lookup/barcode?code=<gtin>` → `{ product: { name, brand, category, quantity, notes, code, image, source } | null, code }`

  Turns a scanned EAN-8 / UPC-A / EAN-13 / GTIN-14 into a prefilled suggestion. **Nothing is saved** — the `product` shape is deliberately identical to `POST /api/v1/scan/product`, so the same confirm-then-add screen serves both, and it drops straight into `POST /api/v1/shopping-list`.

  Sources are the free, key-less Open Food / Products / Beauty Facts databases (no AI, no cost, no quota). Separators in `code` are tolerated; the check digit is validated before any request is spent.

  | Response | Meaning |
  |---|---|
  | `200 { product: {…} }` | Found. |
  | `200 { product: null }` | Valid barcode, but no database knows it. Let the user type it in, or fall back to `POST /api/v1/scan/product` (AI photo). |
  | `400` | `code` missing, or not a valid GTIN (failed check digit / wrong length). |
  | `502` | No product database could be reached. Retryable. |

### Shopping list (quick to-buy)
- `GET /api/v1/shopping-list` → `{ items: [{ id, name, quantity, category, brand, note, checked, aiScanned, createdAt }] }`
- `POST /api/v1/shopping-list` `{ name, quantity?, category?, brand?, note? }` → `{ items }`
- `PATCH /api/v1/shopping-list/:id` `{ checked?, name?, quantity?, category?, brand?, note? }` → `{ ok }`
- `DELETE /api/v1/shopping-list/:id` → `{ ok }`

### Files (images / PDFs)
Paths returned by the API (an item's `photo`, a receipt's `file`/`thumb`) are served from `GET /api/files/<path>`. **Send the same `Authorization: Bearer` token** — the route accepts either the web session cookie or a bearer token. Fetch the bytes and render them (a native `<img src>` can't attach the header).

## MCP connector (drive Pharos from Claude)
`POST /api/mcp` — a JSON-RPC 2.0 (Streamable-HTTP) MCP server, same bearer token. Methods: `initialize`, `tools/list`, `tools/call`, `ping`. Add it in Claude as a custom connector (URL `https://<host>/api/mcp`) or test with MCP Inspector / Claude Code. See **Settings → Mobile / MCP**.

## Roadmap (next additions)
- PATCH/DELETE for expenses & subscriptions.
- Optional per-token scopes.
