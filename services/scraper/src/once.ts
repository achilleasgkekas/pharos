// One-shot entry: `npm run scrape:once`
import { connect, disconnect } from './db.js';
import { runOnce } from './run.js';

await connect();
try {
  await runOnce();
} finally {
  await disconnect();
}
