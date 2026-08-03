#!/usr/bin/env node
// Screenshot a running landing server without the Claude Browser pane.
//
// Why this exists: on 2026-08-03 the pane's `computer screenshot` returned a black
// frame and then timed out with "Browser pane is currently hidden", because the
// screenshot surface does not follow scrolling done from the JS context. An
// unattended run cannot un-hide that pane, so visual proof was lost for the run.
// This talks to headless Chrome over the DevTools protocol instead: it clips the
// section straight out of the page (captureBeyondViewport), so nothing depends on
// scroll position, on the pane being visible, or on a window at all.
//
// Zero dependencies: Node 22+ ships a global WebSocket, and Chrome is already on
// the machine. Nothing here is imported by the site, it is a dev-time tool.
//
// Usage:
//   node scripts/shot.mjs --url http://localhost:3100 --selector "#pricing" --out pricing.png
//   node scripts/shot.mjs --url http://localhost:3100 --mobile --out hero-mobile.png
//   node scripts/shot.mjs --url http://localhost:3100 --full --out whole-page.png
//
// Options:
//   --url <u>        page to open (required)
//   --selector <s>   CSS selector to clip to; omit for the viewport
//   --out <file>     output name, written into .shots/ (default: shot.png)
//   --width <n>      viewport width (default 1280, or 375 with --mobile)
//   --height <n>     viewport height (default 800, or 812 with --mobile)
//   --mobile         mobile viewport + touch emulation
//   --full           capture the whole scrollable page
//   --scale <n>      device pixel ratio (default 2)
//   --wait <ms>      extra settle time after load (default 700)
//   --debug          print CDP milestones to stderr

import { spawn } from 'node:child_process';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(HERE, '..', '.shots');
const OVERALL_TIMEOUT_MS = 150_000; // Chrome's cold start alone measured ~13s here

function parseArgs(argv) {
  const args = { scale: 2, wait: 700, out: 'shot.png' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => argv[++i];
    if (a === '--url') args.url = val();
    else if (a === '--selector') args.selector = val();
    else if (a === '--out') args.out = val();
    else if (a === '--width') args.width = Number(val());
    else if (a === '--height') args.height = Number(val());
    else if (a === '--scale') args.scale = Number(val());
    else if (a === '--wait') args.wait = Number(val());
    else if (a === '--mobile') args.mobile = true;
    else if (a === '--full') args.full = true;
    else if (a === '--debug') args.debug = true;
    else throw new Error(`Unknown option: ${a}`);
  }
  if (!args.url) throw new Error('--url is required');
  args.width ??= args.mobile ? 375 : 1280;
  args.height ??= args.mobile ? 812 : 800;
  return args;
}

// Chrome, or the Chromium that Playwright already cached for this machine.
function findChrome() {
  const fromEnv = process.env.CHROME_BIN;
  const candidates = [
    fromEnv,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].filter(Boolean);
  const found = candidates.find((c) => existsSync(c));
  if (!found) throw new Error('No Chrome found. Set CHROME_BIN to a Chrome/Chromium binary.');
  return found;
}

// Launch headless Chrome on an ephemeral port and read back its DevTools endpoint.
function launchChrome(binary, profileDir) {
  const proc = spawn(
    binary,
    [
      '--headless=new',
      '--remote-debugging-port=0',
      `--user-data-dir=${profileDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--hide-scrollbars',
      '--force-color-profile=srgb',
      '--disable-gpu',
      'about:blank',
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );

  return new Promise((resolve, reject) => {
    let buf = '';
    const timer = setTimeout(() => reject(new Error('Chrome did not report a DevTools endpoint')), 20_000);
    proc.stderr.on('data', (chunk) => {
      buf += chunk;
      const m = buf.match(/DevTools listening on (ws:\/\/\S+)/);
      if (m) {
        clearTimeout(timer);
        resolve({ proc, wsUrl: m[1] });
      }
    });
    proc.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`Chrome exited early (code ${code})`));
    });
  });
}

// Minimal CDP client: one socket, flattened sessions, promise per command id.
function connectCdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  const pending = new Map();
  const waiters = [];
  let nextId = 1;

  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(`${msg.error.message} (${msg.method ?? 'cdp'})`));
      else resolve(msg.result);
      return;
    }
    for (let i = waiters.length - 1; i >= 0; i--) {
      if (waiters[i].method === msg.method) waiters.splice(i, 1)[0].resolve(msg.params);
    }
  });

  const ready = new Promise((resolve, reject) => {
    ws.addEventListener('open', () => resolve());
    ws.addEventListener('error', () => reject(new Error(`Cannot reach ${wsUrl}`)));
  });

  return {
    ready,
    send(method, params = {}, sessionId) {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params, ...(sessionId && { sessionId }) }));
      });
    },
    once(method, timeoutMs = 30_000) {
      return new Promise((resolve, reject) => {
        const waiter = { method, resolve };
        waiters.push(waiter);
        setTimeout(() => {
          const i = waiters.indexOf(waiter);
          if (i >= 0) waiters.splice(i, 1);
          reject(new Error(`Timed out waiting for ${method}`));
        }, timeoutMs);
      });
    },
    close: () => ws.close(),
  };
}

async function evaluate(cdp, sessionId, expression) {
  const res = await cdp.send(
    'Runtime.evaluate',
    { expression, awaitPromise: true, returnByValue: true },
    sessionId,
  );
  if (res.exceptionDetails) throw new Error(res.exceptionDetails.exception?.description ?? 'Page script failed');
  return res.result.value;
}

// Do NOT wait for Page.loadEventFired: the site pulls its three fonts from Google
// Fonts, so a machine that is offline or rate-limited never fires `load` and the
// run dies with nothing to show (measured 2026-08-03). The document being parsed
// and painted is what a screenshot needs, so poll readyState instead: settle for
// 'complete' when it comes, and accept 'interactive' once the grace period is up,
// which means a stalled font request costs a fallback typeface, not the shot.
const READY_GRACE_MS = 8_000;
const READY_CAP_MS = 30_000;

async function waitForDocument(cdp, sessionId, debug) {
  const started = Date.now();
  for (;;) {
    const state = await evaluate(cdp, sessionId, 'document.readyState');
    const waited = Date.now() - started;
    if (state === 'complete') {
      if (debug) console.error(`shot.mjs: document complete after ${waited}ms`);
      return;
    }
    if (state === 'interactive' && waited > READY_GRACE_MS) {
      console.error(`shot.mjs: still loading after ${waited}ms (probably a slow font or asset), capturing anyway`);
      return;
    }
    if (waited > READY_CAP_MS) throw new Error(`Document stuck in "${state}" after ${waited}ms`);
    await new Promise((r) => setTimeout(r, 150));
  }
}

// Reveal-on-scroll sections stay invisible until they have been in view once, so
// walk the whole page before measuring anything. Smooth scrolling is turned off
// first, otherwise each step lands somewhere between the two positions.
const PRIME_PAGE = `(async () => {
  document.documentElement.style.scrollBehavior = 'auto';
  const step = Math.round(innerHeight * 0.8);
  for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
    document.documentElement.scrollTop = y;
    await new Promise((r) => setTimeout(r, 60));
  }
  document.documentElement.scrollTop = 0;
  await new Promise((r) => setTimeout(r, 120));
  return document.documentElement.scrollHeight;
})()`;

const measure = (selector) => `(() => {
  const el = document.querySelector(${JSON.stringify(selector)});
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height };
})()`;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const profileDir = path.join(tmpdir(), `pharos-shot-${process.pid}`);
  const t0 = Date.now();
  const { proc, wsUrl } = await launchChrome(findChrome(), profileDir);
  if (args.debug) console.error(`shot.mjs: chrome ready after ${Date.now() - t0}ms`);
  const cdp = connectCdp(wsUrl);
  let outPath;

  try {
    await cdp.ready;
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });

    await cdp.send('Page.enable', {}, sessionId);
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: args.width,
      height: args.height,
      deviceScaleFactor: args.scale,
      mobile: Boolean(args.mobile),
      screenWidth: args.width,
      screenHeight: args.height,
    }, sessionId);

    await cdp.send('Page.navigate', { url: args.url }, sessionId);
    await waitForDocument(cdp, sessionId, args.debug);
    await new Promise((r) => setTimeout(r, args.wait));

    const pageHeight = await evaluate(cdp, sessionId, PRIME_PAGE);

    let clip;
    if (args.selector) {
      const box = await evaluate(cdp, sessionId, measure(args.selector));
      if (!box) throw new Error(`Selector not found on the page: ${args.selector}`);
      // A little air around the section so the shot does not look cropped.
      const pad = 16;
      clip = {
        x: Math.max(0, box.x - pad),
        y: Math.max(0, box.y - pad),
        width: Math.min(args.width, box.width + pad * 2),
        height: box.height + pad * 2,
        scale: 1,
      };
    } else if (args.full) {
      clip = { x: 0, y: 0, width: args.width, height: pageHeight, scale: 1 };
    }

    const { data } = await cdp.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
      ...(clip && { clip }),
    }, sessionId);

    await mkdir(OUT_DIR, { recursive: true });
    outPath = path.join(OUT_DIR, args.out);
    await writeFile(outPath, Buffer.from(data, 'base64'));
  } finally {
    try { await cdp.send('Browser.close'); } catch {}
    cdp.close();
    proc.kill();
    await rm(profileDir, { recursive: true, force: true }).catch(() => {});
  }

  console.log(outPath);
}

const guard = setTimeout(() => {
  console.error(`shot.mjs: gave up after ${OVERALL_TIMEOUT_MS / 1000}s`);
  process.exit(1);
}, OVERALL_TIMEOUT_MS);
guard.unref();

main().catch((err) => {
  console.error(`shot.mjs: ${err.message}`);
  process.exit(1);
});
