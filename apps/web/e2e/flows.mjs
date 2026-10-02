// End-to-end flows (CI, #331): the critical paths a user takes, driven through the real UI of a
// production build with a real MongoDB. Runs after smoke.mjs (which creates the admin account).
//
//   BASE_URL=http://127.0.0.1:3000 node e2e/flows.mjs
//
// Each flow creates data with a unique tag and checks it shows up where it should, including
// the cross-module links (a bill marked paid and a fuel fill both logging an expense) and a
// backup export → restore round trip. Then axe checks a few key pages for serious and critical
// accessibility violations.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AxeBuilder } from '@axe-core/playwright';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3000';
const USER = 'ci-admin';
const PASS = 'ci-password-123';
const TAG = `e2e${Date.now().toString(36)}`;

const failures = [];
async function flow(name, fn) {
  try {
    await fn();
    console.log(`✓ ${name}`);
  } catch (e) {
    failures.push(name);
    console.error(`✗ ${name}\n  ${(e.stack || String(e)).split('\n').slice(0, 4).join('\n  ')}`);
    await page.screenshot({ path: `e2e-failure-${failures.length}.png`, fullPage: true }).catch(() => {});
  }
}
function expect(cond, msg) {
  if (!cond) throw new Error(msg);
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
const page = await context.newPage();
page.setDefaultTimeout(15_000);
let pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

/** Open a page and close the first-run welcome tour if it is showing. */
async function open(path) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
  const skip = page.getByRole('button', { name: 'Skip', exact: true });
  if (await skip.count()) {
    await skip.last().click();
    await page.getByText('WELCOME TO PHAROS', { exact: false }).waitFor({ state: 'hidden' }).catch(() => {});
  }
}
const newButton = () => page.locator('button:visible', { hasText: /^\s*New\s*$/ }).first();

// ── Login ─────────────────────────────────────────────────────────────────
await page.goto(`${BASE}/login`);
await page.fill('input[name=username]', USER);
await page.fill('input[name=password]', PASS);
await page.locator('form button[type=submit], form button').last().click();
await page.waitForLoadState('networkidle');
if (new URL(page.url()).pathname.startsWith('/login')) {
  console.error('✗ could not log in (run e2e/smoke.mjs first, it creates the account)');
  process.exit(1);
}
console.log('✓ logged in');

// ── Items ─────────────────────────────────────────────────────────────────
await flow('add an item', async () => {
  await open('/items');
  await newButton().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByPlaceholder('e.g. Logitech MX Master 3S').fill(`Drill ${TAG}`);
  await dialog.getByPlaceholder('what it cost you').fill('89');
  await dialog.getByRole('button', { name: 'Create', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  await open('/items');
  await page.getByText(`Drill ${TAG}`).first().waitFor();
});

// ── Expenses ──────────────────────────────────────────────────────────────
await flow('add an expense', async () => {
  await open('/expenses');
  await newButton().click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('button', { hasText: 'e.g. utility, landlord' }).click();
  await dialog.getByPlaceholder('Search…').fill(`Market ${TAG}`);
  await dialog.getByRole('button', { name: `+ Use “Market ${TAG}”`, exact: true }).click();
  await dialog.getByLabel('Amount (€)').fill('12.50');
  await dialog.getByRole('button', { name: 'Add', exact: true }).last().click();
  await dialog.waitFor({ state: 'hidden' });
  await open('/expenses');
  await page.getByText(`Market ${TAG}`).first().waitFor();
});

// ── Bills: mark paid → expense ────────────────────────────────────────────
await flow('mark a bill paid and log it as an expense', async () => {
  await open('/expenses/to-pay');
  await newButton().click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('input[name=title]').fill(`Power ${TAG}`);
  await dialog.locator('input[name=vendor]').fill(`Utility ${TAG}`);
  await dialog.locator('input[name=amount]').fill('45');
  await dialog.locator('input[name=dueDate]').fill(new Date().toISOString().slice(0, 10));
  await dialog.getByRole('button', { name: 'Add bill' }).click();
  await dialog.waitFor({ state: 'hidden' });

  await page.getByText(`Power ${TAG}`).first().click();
  const detail = page.getByRole('dialog');
  await detail.getByLabel('Also log this as an expense').check();
  await detail.getByRole('button', { name: 'Mark paid' }).click();
  await detail.waitFor({ state: 'hidden' });

  await open('/expenses/to-pay');
  await page.getByRole('button', { name: 'Paid', exact: true }).click();
  await page.getByText(`Power ${TAG}`).first().waitFor();
  await open('/expenses');
  await page.getByText(`Utility ${TAG}`).first().waitFor();
});

// ── Vehicles: fuel log → expense ──────────────────────────────────────────
await flow('log a fuel fill on a vehicle (and its expense)', async () => {
  await open('/vehicles');
  await newButton().click();
  // Wait for the form's heading to go away: the Save button itself turns into "Saving…" at
  // once, so it is no signal of completion.
  await page.getByLabel('Name').fill(`Golf ${TAG}`);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('heading', { name: 'Add vehicle' }).waitFor({ state: 'hidden' });
  // #363: a new vehicle opens on its own page.
  await page.getByRole('heading', { level: 1, name: `Golf ${TAG}` }).waitFor();

  await page.getByRole('button', { name: 'Add fuel' }).click();
  await page.getByLabel('Odometer (km)').fill('120000');
  await page.getByLabel('Litres').fill('40');
  await page.getByLabel('Cost', { exact: true }).fill('70');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('heading', { name: `Add fuel · Golf ${TAG}` }).waitFor({ state: 'hidden' });
  await page.getByRole('tab', { name: /^Fuel\s*1$/ }).waitFor();

  await open('/vehicles');
  await page.getByRole('link', { name: new RegExp(`Golf ${TAG}`) }).waitFor();
  await open('/expenses');
  await page.getByText(`Golf ${TAG}`, { exact: false }).first().waitFor();
});

// ── Vehicles: fill a fuel entry from a scanned receipt (#363) ─────────────
// The scan goes through the app's real AI path to a stand-in Ollama on its default address, which
// answers with what a model would read off a pump receipt. Nothing is saved until Save.
await flow('fill a fuel entry from a scanned receipt', async () => {
  const fake = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      res.setHeader('content-type', 'application/json');
      if (req.url === '/api/chat') {
        const content = JSON.stringify({ date: '2026-03-14', station: 'Shell Kifisias', liters: 32.5, pricePerLiter: 1.849, total: 60.09, fuelType: 'petrol', odometer: null });
        res.end(JSON.stringify({ model: 'fake', message: { role: 'assistant', content }, done: true, prompt_eval_count: 1, eval_count: 1 }));
      } else if (req.url === '/api/tags') {
        res.end(JSON.stringify({ models: [] }));
      } else {
        res.statusCode = 404;
        res.end('{}');
      }
    });
  });
  await new Promise((resolve, reject) => fake.once('error', reject).listen(11434, resolve));
  try {
    await open('/vehicles');
    await page.getByRole('link', { name: new RegExp(`Golf ${TAG}`) }).click();
    await page.getByRole('heading', { level: 1, name: `Golf ${TAG}` }).waitFor();
    await page.getByRole('button', { name: 'Add fuel' }).click();
    // A 1×1 PNG stands in for the photo; the stand-in model does not look at it.
    const photo = join(tmpdir(), `receipt-${TAG}.png`);
    writeFileSync(photo, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
    await page.getByLabel('Scan receipt').setInputFiles(photo);
    await page.getByText('Filled from the scan').waitFor({ timeout: 30_000 });
    expect((await page.getByLabel('Litres').inputValue()) === '32.5', 'litres were not filled from the scan');
    expect((await page.getByLabel('Cost', { exact: true }).inputValue()) === '60.09', 'the total was not filled from the scan');
    expect((await page.getByLabel('Station').inputValue()) === 'Shell Kifisias', 'the station was not filled from the scan');
    // The receipt has no odometer: the form asks for it, and saves only once it is there.
    await page.getByLabel('Odometer (km)').fill('120600');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByRole('heading', { name: `Add fuel · Golf ${TAG}` }).waitFor({ state: 'hidden' });
    await page.getByRole('tab', { name: /^Fuel\s*2$/ }).click();
    await page.getByText('Shell Kifisias').first().waitFor();
    // The photo stays with the entry.
    await page.getByRole('link', { name: 'Attached receipt' }).first().waitFor();
  } finally {
    await new Promise((resolve) => fake.close(resolve));
  }
});

// ── Backup: export → restore ──────────────────────────────────────────────
await flow('export a backup and restore it', async () => {
  await open('/settings');
  await page.getByRole('link', { name: 'Backups & exports' }).first().click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export JSON' }).click()]);
  const file = await download.path();
  expect(file, 'the export produced no file');

  // Delete something the backup holds, so the restore has to bring it back. Without this the
  // flow passes even if restore cannot revive a deleted record, the case a backup exists for.
  // Deleting the vehicle also soft-deletes its fuel log, so the children are covered too.
  await open('/vehicles');
  await page.getByRole('link', { name: new RegExp(`Golf ${TAG}`) }).click();
  await page.getByRole('heading', { level: 1, name: `Golf ${TAG}` }).waitFor();
  await page.getByRole('button', { name: 'Delete vehicle', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click(); // the app's confirm dialog
  await page.waitForURL(/\/vehicles$/);
  await page.getByRole('link', { name: new RegExp(`Golf ${TAG}`) }).waitFor({ state: 'detached' });

  await open('/settings');
  await page.getByRole('link', { name: 'Backups & exports' }).first().click();
  await page.locator('input[type=file][accept="application/json,.json"]').first().setInputFiles(file);
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm' }).click();
  const done = page.getByText(/✓ Restored \d+ records/);
  await done.waitFor({ timeout: 30_000 });
  const n = Number((await done.textContent()).match(/\d+/)[0]);
  // The flows above created an item, a vehicle, two fuel logs, a bill and expenses.
  expect(n >= 6, `restore reported ${n} records, expected at least 6`);

  await open('/items');
  await page.getByText(`Drill ${TAG}`).first().waitFor();
  await open('/vehicles');
  await page.getByRole('link', { name: new RegExp(`Golf ${TAG}`) }).click();
  await page.getByRole('tab', { name: /^Fuel\s*2$/ }).waitFor();
});

// ── Encrypted backup: the app's own passphrase prompt (#351) ─────────────
await flow('export an encrypted backup through the passphrase dialog', async () => {
  await open('/settings');
  await page.getByRole('link', { name: 'Backups & exports' }).first().click();
  await page.getByRole('button', { name: 'Encrypted export' }).first().click();
  let dialog = page.getByRole('dialog');
  await dialog.locator('input[type=password]').fill('ci-passphrase-1');
  await dialog.getByRole('button', { name: 'Continue' }).click();
  await page.getByText('Same passphrase again').waitFor(); // the second prompt, not the first one closing
  dialog = page.getByRole('dialog');
  await dialog.locator('input[type=password]').fill('ci-passphrase-1');
  const [download] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: 'Encrypted export' }).click()]);
  expect((await download.suggestedFilename()).endsWith('.enc.json'), 'the encrypted export is not an .enc.json file');
});

// ── Accessibility ─────────────────────────────────────────────────────────
// Serious and critical axe violations only, on the pages people use most. Colour contrast is
// left out for now: the dark theme's faint text is a known design debt, and gating on it here
// would make this check red for reasons unrelated to the PR under test.
const A11Y_PAGES = ['/login', '/', '/items', '/expenses', '/expenses/to-pay', '/settings'];
for (const path of A11Y_PAGES) {
  await flow(`accessibility: ${path}`, async () => {
    if (path === '/login') {
      const anon = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const p = await anon.newPage();
      await p.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
      await checkA11y(p, path);
      await anon.close();
    } else {
      await open(path);
      await checkA11y(page, path);
    }
  });
}
async function checkA11y(p, path) {
  const res = await new AxeBuilder({ page: p }).withTags(['wcag2a', 'wcag2aa']).disableRules(['color-contrast']).analyze();
  const bad = res.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  const lines = bad.flatMap((v) => [`${v.impact} ${v.id}: ${v.help}`, ...v.nodes.map((n) => `  ${n.target.join(' ')}  ${n.html.slice(0, 160)}`)]);
  expect(!bad.length, `${path}:\n    ${lines.join('\n    ')}`);
}

if (pageErrors.length) console.warn(`\nBrowser errors seen during the flows:\n  ${[...new Set(pageErrors)].join('\n  ')}`);
await browser.close();
if (failures.length) {
  console.error(`\n${failures.length} flow(s) failed: ${failures.join(', ')}`);
  process.exit(1);
}
console.log('\nAll flows passed.');
