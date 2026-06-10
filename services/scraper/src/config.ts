// Runtime config, all overridable by env. Mirrors the web app's env names so the
// same docker-compose values work for both services.

export const config = {
  mongoUri: process.env.MONGO_URI ?? 'mongodb://admin:changeme@localhost:27017/homepage?authSource=admin',
  ollamaHost: process.env.OLLAMA_HOST ?? 'http://localhost:11434',
  ollamaModel: process.env.OLLAMA_MODEL ?? 'qwen2.5vl:7b',
  // Context window; Ollama's small default truncates big pages → broken JSON. 8k is safe.
  numCtx: Number(process.env.OLLAMA_NUM_CTX ?? 8192),

  // node-cron expression — default every 6 hours
  cron: process.env.SCRAPER_CRON ?? '0 */6 * * *',
  // Run one pass immediately on startup (besides the schedule)
  runOnStart: process.env.SCRAPER_RUN_ON_START !== 'false',

  // Alert when a price drops at least this % below the lowest previously seen
  dropAlertPct: Number(process.env.PRICE_DROP_ALERT_PCT ?? 10),

  // ntfy push (https://ntfy.sh or self-hosted). Empty topic disables alerts.
  ntfyUrl: process.env.NTFY_URL ?? 'https://ntfy.sh',
  ntfyTopic: process.env.NTFY_TOPIC ?? '',

  // Be gentle: delay between page fetches (ms)
  fetchDelayMs: Number(process.env.SCRAPER_FETCH_DELAY_MS ?? 1500),

  // Cap how many items to process per pass (0 = all). Handy for testing/throttling.
  limit: Number(process.env.SCRAPER_LIMIT ?? 0),
};
