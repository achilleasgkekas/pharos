// End-to-end smoke test (CI, #331): runs against a production build with a real MongoDB.
//
//   BASE_URL=http://127.0.0.1:3000 node e2e/smoke.mjs
//
// 1. First-run setup creates the admin account (or logs in, if the database already has one).
// 2. Every main page is opened: it must answer below 500, render its <h1>, and throw no
//    uncaught error in the browser. That catches the class of bug unit tests cannot: a server
//    component that crashes on real data, a missing env var, a broken import in one route.
// 3. Every page fits a 390px phone without scrolling sideways.
// 4. The REST API refuses an unauthenticated request.
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3000';
const USER = 'ci-admin';
const PASS = 'ci-password-123';
// SHOTS_DIR set: keep a screenshot of every page, desktop and phone. CI attaches them to the run
// (#351), so a reviewer can see what a UI change looks like on every page without running it.
const SHOTS = process.env.SHOTS_DIR;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const shotName = (path, tag) => `${SHOTS}/${tag}-${path === '/' ? 'home' : path.slice(1).replace(/\//g, '_')}.png`;

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
  if (SHOTS) await page.screenshot({ path: shotName(path, 'desktop'), fullPage: true });
}

// ── 3. Every page fits a phone (#351) ─────────────────────────────────────
// 390px is an iPhone 12-15. A page wider than the screen scrolls sideways, which on a phone
// reads as the whole app sliding left and right.
await page.setViewportSize({ width: 390, height: 844 });
for (const path of PAGES) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
  const { scroll, view, widest } = await page.evaluate(() => {
    const view = window.innerWidth;
    let widest = '';
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (r.right > view + 1 && getComputedStyle(el).position !== 'fixed') {
        widest = `${el.tagName.toLowerCase()}.${String(el.className).split(' ').slice(0, 3).join('.')}`;
        break;
      }
    }
    return { scroll: document.documentElement.scrollWidth, view, widest };
  });
  if (SHOTS) await page.screenshot({ path: shotName(path, 'phone'), fullPage: true });
  if (scroll > view + 1) fail(`${path} is ${scroll}px wide on a ${view}px phone (first overflow: ${widest})`);
  else console.log(`✓ ${path} fits 390px`);
}
await page.setViewportSize({ width: 1280, height: 900 });

// ── 4. The API needs a token ───────────────────────────────────────────────
const api = await fetch(`${BASE}/api/v1/overview`);
if (api.status !== 401) fail(`/api/v1/overview without a token answered ${api.status}, expected 401`);
else console.log('✓ /api/v1 refuses an unauthenticated request');

await browser.close();
if (failures.length) {
  console.error(`\n${failures.length} smoke check(s) failed`);
  process.exit(1);
}
console.log(`\nAll ${PAGES.length} pages and the API guard passed.`);
