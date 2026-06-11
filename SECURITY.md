# Security notes

Posture: self-hosted, single-user, reached over WireGuard/LAN. No app-level
auth by design. The notes below cover the hardening pass of 2026-06-11.

## Applied in code/config (live after the next rebuild)

- **storage.ts** — `readFile`/`deleteFile` now resolve and contain every path
  inside `STORAGE_ROOT` (blocks `..`/absolute traversal from route params or a
  tampered DB `filePath`).
- **ssrf.ts** (web + scraper) — `assertPublicUrl()` resolves the host and rejects
  private/loopback/link-local/internal targets. Wired into `scrape.fetchPageText`
  and the item image fetches (`attachImagesFromUrl`, `attachOneImage`), plus a
  20 MB image cap. Stops URL-import / scraper from probing mongo/searxng/ollama/LAN.
- **importData** — strips tampered `filePath`/`thumbPath`/`photos` before upsert.
- **uploadReceipt / uploadExpense** — reject > 15 MB (matches server-action limit).
- **/api/files** — HTML receipts served with a strict CSP
  (`default-src 'none'`; same-origin/data images only; `form-action`/`base-uri none`).
  External images are blocked so a malicious email receipt can't beacon on open.
  To allow remote logos, change `img-src` to `'self' data: https:`.
- **softDelete.ts** — plugin now also hooks `updateOne/updateMany/deleteOne/
  deleteMany/replaceOne`; trash ops (restore/purge/restore-import) opt out with
  `.setOptions({ withDeleted: true })`.
- **exportCSV** — neutralises leading `= + - @` (CSV/formula injection).
- **pullOllamaModel** — validates the model name (length + charset).
- **anthropic.ts** — redacts the API key from error strings.
- **jobRunner** — clears per-item timers; swallows late rejections.
- **next** — bumped 15.0.3 → 15.5.19 (fixes the critical + several high CVEs).
- **scraper node-cron** — bumped ^3 → ^4.2.1 (drops the transitive `uuid` advisory;
  `npm audit` now clean). `@types/node-cron` removed (v4 ships its own types).
  Typecheck-verified; rebuild the scraper image (`--profile scraper build`) to ship it.
- **docker-compose** — mongo / mongo-express / flaresolverr / searxng now bind to
  `127.0.0.1` (were `0.0.0.0`). Only `web:3000` stays exposed (needs VPN/LAN).
  The committed `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` default is removed; secrets
  now come from `.env` (gitignored).

## Manual apply — required to actually close the critical findings

The data volume was first initialised with `MONGO_PASS=changeme`. Changing it in
`.env` is not enough; rotate the live user, then recreate so the new bindings,
the new key, and the rebuilt (hardened) web image all take effect:

```bash
cd ~/Desktop/homepage
# 1) rotate the existing Mongo user to the new password from .env
NEW=$(grep '^MONGO_PASS=' .env | cut -d= -f2-)
docker exec homepage-mongo mongosh -u admin -p changeme --authenticationDatabase admin \
  --eval "db.getSiblingDB('admin').changeUserPassword('admin', '$NEW')"
# 2) rebuild + recreate with the new .env and loopback bindings
docker compose up -d --build
```

## Accepted / deferred

- **macOS firewall left off** — by choice. Not critical: the sensitive services
  bind to `127.0.0.1`, so only `web:3000` faces the LAN (the accepted VPN-only,
  no-auth posture anyway). The firewall would only add a second layer in front of
  that one port.
- **No app auth** — accepted (VPN-only). If `web:3000` is ever exposed beyond the
  VPN, front it with an authenticated reverse proxy.
- **Plaintext secrets in Mongo** (AI keys, OneDrive token, SMB/FTP/UniFi pass) —
  acceptable only while Mongo is loopback-bound + strong password. Encrypt-at-rest
  is the next step if the threat model widens.
- **postcss (moderate)** — build-time only, bundled inside `next`; not runtime
  reachable. npm's only "fix" downgrades next to 9.x, so left as-is.
- **UniFi `rejectUnauthorized:false`** — required for the gateway's self-signed
  cert; scoped to the configured host.
