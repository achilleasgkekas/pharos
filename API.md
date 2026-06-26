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

## Endpoints

### Dashboard
`GET /api/v1/overview`
→ `{ counts: { items, shoppingList, receipts, expenses, subscriptions, openTasks }, installmentsOwed, activeInstallmentPlans, currency }`

### Items (product tracker / inventory)
- `GET /api/v1/items?status=shopping|inventory|all`
  → `{ items: [{ id, num, title, status, category, currentPrice, purchasedPrice, targetPrice, specs, warrantyUntil, tags, photo }] }`
- `POST /api/v1/items` `{ title, status?, category?, currentPrice? }` → `{ item }`

### Shopping list (quick to-buy)
- `GET /api/v1/shopping-list` → `{ items: [{ id, name, quantity, category, brand, note, checked, aiScanned, createdAt }] }`
- `POST /api/v1/shopping-list` `{ name, quantity?, category?, brand?, note? }` → `{ items }`
- `PATCH /api/v1/shopping-list/:id` `{ checked?, name?, quantity?, category?, brand?, note? }` → `{ ok }`
- `DELETE /api/v1/shopping-list/:id` → `{ ok }`

### AI product scan (mobile camera)
`POST /api/v1/scan/product` — multipart form, field **`file`** = product photo
→ `{ data: { name, brand, category, quantity, notes } }`
Returns a *suggested* entry only; have the user confirm, then `POST /api/v1/shopping-list`.

### Files (images / PDFs)
Paths returned by the API (e.g. an item's `photo`) are served from `/api/files/<path>`. That route is currently cookie-gated; bearer access for files is on the roadmap.

## Roadmap (next additions)
- Writes for receipts / expenses / subscriptions / tasks, and PATCH/DELETE for items.
- Pagination + `updatedSince` for sync.
- Bearer-token access to `/api/files` so a mobile app can load photos/PDFs.
- Optional per-token scopes.
