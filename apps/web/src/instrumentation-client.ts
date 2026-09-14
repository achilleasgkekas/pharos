// Runs in the browser before the app hydrates (Next.js ≥ 15.3). Starts error reporting as early as
// possible when — and only when — the server enabled it via window.__PHAROS_SENTRY__.
import { ensureClientSentry } from '@/lib/clientErrorReporting';

void ensureClientSentry();
