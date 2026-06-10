// Long-running worker: runs a scrape pass on a cron schedule (default every 6h).
import cron from 'node-cron';
import { config } from './config.js';
import { connect } from './db.js';
import { runOnce } from './run.js';

let running = false;

async function tick(): Promise<void> {
  if (running) {
    console.log('[cron] previous pass still running, skipping this tick');
    return;
  }
  running = true;
  try {
    await runOnce();
  } catch (err) {
    console.error('[cron] pass failed:', err);
  } finally {
    running = false;
  }
}

await connect();

if (!cron.validate(config.cron)) {
  console.error(`[scraper] invalid SCRAPER_CRON "${config.cron}", exiting.`);
  process.exit(1);
}

console.log(`[scraper] worker up — schedule "${config.cron}", drop alert ≥${config.dropAlertPct}%, ntfy ${config.ntfyTopic ? 'on' : 'off'}`);

if (config.runOnStart) await tick();

cron.schedule(config.cron, tick);

// Keep the process alive + exit cleanly on signals
for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    console.log(`[scraper] ${sig} received, shutting down`);
    process.exit(0);
  });
}
