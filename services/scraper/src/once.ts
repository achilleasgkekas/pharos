// One-shot entry: `npm run scrape:once`
import { connect, disconnect } from './db.js';
import { runOnce } from './run.js';
import { recordScraperStart, recordScraperPassComplete } from './appConfig.js';

await connect();
await recordScraperStart();
try {
  const stats = await runOnce();
  await recordScraperPassComplete({ stats });
} catch (err) {
  await recordScraperPassComplete({ error: err instanceof Error ? err.message : String(err) });
  throw err;
} finally {
  await disconnect();
}

