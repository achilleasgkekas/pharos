# Price Scraper

Standalone worker that tracks prices for items in the library.

For every item that has product links, it fetches each page, extracts the current
price with the local Ollama model, appends a `priceHistory` entry, updates
`currentPrice`, and pushes an `ntfy` alert when a price drops ≥10% below the
lowest previously seen.

## Run

```bash
npm install

# one pass then exit (good for testing)
npm run scrape:once

# long-running worker (cron, default every 6h)
npm start
```

Or via Docker (opt-in profile, from the repo root):

```bash
docker compose --profile scraper up -d --build
docker compose logs -f scraper
```

## Config (env)

| Var | Default | Notes |
|-----|---------|-------|
| `MONGO_URI` | `mongodb://admin:changeme@localhost:27017/homepage?authSource=admin` | same DB as the web app |
| `OLLAMA_HOST` | `http://localhost:11434` | native Ollama on the Mac host |
| `OLLAMA_MODEL` | `qwen2.5vl:7b` | |
| `SCRAPER_CRON` | `0 */6 * * *` | every 6 hours |
| `SCRAPER_RUN_ON_START` | `true` | also run once on boot |
| `PRICE_DROP_ALERT_PCT` | `10` | alert threshold |
| `NTFY_URL` / `NTFY_TOPIC` | `https://ntfy.sh` / *(empty)* | empty topic disables alerts |
| `SCRAPER_FETCH_DELAY_MS` | `1500` | politeness delay between fetches |
| `SCRAPER_LIMIT` | `0` | cap items per pass (0 = all) |

## Limits

Fetch-based: works for stores that serve the price in the HTML or schema.org
JSON-LD (most Greek SSR shops, many product pages). SPA stores (some of the EU
Ubiquiti store) and anti-bot shops (Skroutz, FS.com, MakerWorld return 403/202)
need a real browser. A Playwright fallback is the planned next step.
