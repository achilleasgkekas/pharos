// End-to-end smoke test (CI, #331): runs against a production build with a real MongoDB.
//
//   BASE_URL=http://127.0.0.1:3000 node e2e/smoke.mjs
//
// 1. First-run setup creates the admin account (or logs in, if the database already has one).
// 2. Every main page is opened: it must answer below 500, render its <h1>, and throw no
//    uncaught error in the browser. That catches the class of bug unit tests cannot: a server
//    component that crashes on real data, a missing env var, a broken import in one route.
// 3. The REST API refuses an unauthenticated request.
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3000';
const USER = 'ci-admin';
const PASS = 'ci-password-123';

const PAGES = [
  '/', '/items', '/shopping', '/shopping-list', '/receipts', '/expenses', '/income', '/bills',
  '/utilities', '/vehicles', '/statements', '/subscriptions', '/vouchers', '/calendar', '/tasks',
  '/documents', '/special-dates', '/savings', '/reports', '/jobs', '/history', '/trash', '/settings',
];

const failures = [];
const fail = (msg) => {
  failures.push(msg);
  console.error(`  ✗ ${msg}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
let pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

// ── 1. Setup or login ─────────────────────────────────────────────────────
await page.goto(`${BASE}/setup`);
if (await page.locator('input[name=confirm]').count()) {
  await page.fill('input[name=username]', USER);
  await page.fill('input[name=password]', PASS);
  await page.fill('input[name=confirm]', PASS);
  await page.locator('form button[type=submit], form button').last().click();
  console.log('✓ created the admin account through /setup');
} else {
  await page.goto(`${BASE}/login`);
  await page.fill('input[name=username]', USER);
  await page.fill('input[name=password]', PASS);
  await page.locator('form button[type=submit], form button').last().click();
  console.log('✓ logged in');
}
await page.waitForLoadState('networkidle');
// The setup wizard continues on /setup (preferences, AI) after the account exists, so only a
// bounce back to /login means the session did not stick. The page loop below proves it did.
if (new URL(page.url()).pathname.startsWith('/login')) fail(`still on ${page.url()} after setup/login`);

// ── 2. Every main page renders ─────────────────────────────────────────────
for (const path of PAGES) {
  pageErrors = [];
  const res = await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
  const status = res?.status() ?? 0;
  if (status >= 500) {
    fail(`${path} answered ${status}`);
    continue;
  }
  if (new URL(page.url()).pathname.startsWith('/login')) {
    fail(`${path} bounced to the login page`);
    continue;
  }
  const crashed = await page.getByText('Application error', { exact: false }).count();
  if (crashed) fail(`${path} shows the Next.js "Application error" screen`);
  const h1 = await page.locator('h1').count();
  if (!h1) fail(`${path} rendered no <h1>`);
  if (pageErrors.length) fail(`${path} threw in the browser: ${pageErrors[0]}`);
  if (status < 500 && h1 && !crashed && !pageErrors.length) console.log(`✓ ${path}`);
}

// ── 3. The API needs a token ───────────────────────────────────────────────
const api = await fetch(`${BASE}/api/v1/overview`);
if (api.status !== 401) fail(`/api/v1/overview without a token answered ${api.status}, expected 401`);
else console.log('✓ /api/v1 refuses an unauthenticated request');

await browser.close();
if (failures.length) {
  console.error(`\n${failures.length} smoke check(s) failed`);
  process.exit(1);
}
console.log(`\nAll ${PAGES.length} pages and the API guard passed.`);
