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
// Usage, one image:
//   node scripts/shot.mjs --url http://localhost:3100 --selector "#pricing" --out pricing.png
//
// Usage, several images in ONE Chrome (each --out closes a shot; flags before the
// first --out are the baseline the rest inherit, flags after it are that shot's own):
//   node scripts/shot.mjs --url http://localhost:3100 \
//     --selector "#pricing" --out pricing-desktop.png \
//     --mobile --scale 1 --out pricing-mobile.png \
//     --selector "#hero" --out hero.png \
//     --full --out whole-page.png
//
// Options (any of them can be per-shot except --wait/--prime/--debug):
//   --url <u>        page to open (required; may differ per shot)
//   --selector <s>   CSS selector to clip to; omit for the viewport
//   --out <file>     output name, written into .shots/ (default: shot.png)
//   --width <n>      viewport width (default 1280, or 375 with --mobile)
//   --height <n>     viewport height (default 800, or 812 with --mobile)
//   --mobile         mobile viewport + touch emulation
//   --full           capture the whole scrollable page
//   --scale <n>      device pixel ratio (default 2)
//   --wait <ms>      extra settle time after load (default 700)
//   --prime          walk the page before capturing (only needed if a section
//                    hides until scrolled into view; slow, see PRIME_PAGE)
//   --debug          print CDP milestones and per-shot timings to stderr

import { spawn } from 'node:child_process';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(HERE, '..', '.shots');
// Chrome's cold start alone measured ~12s here, and each extra capture is cheap,
// so the budget is mostly a fixed launch cost plus a generous slice per shot.
const BUDGET_BASE_MS = 240_000;
const BUDGET_PER_SHOT_MS = 30_000;
// A Next dev server compiles the route on the first request, measured at 50s on a
// loaded machine, so navigation gets a much longer leash than any other command.
const NAVIGATE_TIMEOUT_MS = 120_000;

// Each --out closes one shot. Whatever was set BEFORE the first --out is the
// baseline every shot inherits; anything between two --out flags belongs to that
// shot alone. So "--selector #pricing --out a.png --mobile --out b.png" means the
// pricing section twice, desktop then mobile, and a third shot would be desktop
// again. One Chrome serves them all, which is the whole point: the launch costs
// ~12s and each extra capture costs about a second.
function parseArgs(argv) {
  const global = { scale: 2, wait: 700 };
  const shots = [];
  let current = {};
  let baseline = null;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => argv[++i];
    if (a === '--url') current.url = val();
    else if (a === '--selector') current.selector = val();
    else if (a === '--width') current.width = Number(val());
    else if (a === '--height') current.height = Number(val());
    else if (a === '--scale') current.scale = Number(val());
    else if (a === '--mobile') current.mobile = true;
    else if (a === '--full') current.full = true;
    else if (a === '--wait') global.wait = Number(val());
    else if (a === '--debug') global.debug = true;
    else if (a === '--prime') global.prime = true;
    else if (a === '--out') {
      const out = val();
      // The prefix, i.e. the first shot's own flags, becomes the baseline.
      baseline ??= { ...current };
      shots.push({ ...global, ...baseline, ...current, out });
      current = {};
    } else throw new Error(`Unknown option: ${a}`);
  }
  // No --out at all: still one shot, from whatever was given.
  if (!shots.length) shots.push({ ...global, ...current, out: 'shot.png' });

  for (const s of shots) {
    s.url ??= global.url;
    if (!s.url) throw new Error('--url is required');
    s.width ??= s.mobile ? 375 : 1280;
    s.height ??= s.mobile ? 812 : 800;
  }
  const names = shots.map((s) => s.out);
  const dupe = names.find((n, i) => names.indexOf(n) !== i);
  if (dupe) throw new Error(`Two shots would both write ${dupe}; give them different --out names`);
  return { ...global, shots };
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
    // Every command is time-bounded. A page script that never settles (see the
    // note on PRIME_PAGE) must fail loudly instead of hanging the whole run.
    send(method, params = {}, sessionId, timeoutMs = 40_000) {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`${method} did not answer within ${timeoutMs}ms`));
        }, timeoutMs);
        pending.set(id, {
          resolve: (v) => { clearTimeout(timer); resolve(v); },
          reject: (e) => { clearTimeout(timer); reject(e); },
        });
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

// Ask the server for the page over plain HTTP before Chrome does. On a dev server
// this is what pays for the on-demand compile, and paying it here means a slow
// first build shows up as a warm-up wait rather than as a navigation timeout.
async function warmUp(url, debug) {
  const at = Date.now();
  try {
    await fetch(url, { signal: AbortSignal.timeout(NAVIGATE_TIMEOUT_MS) });
    if (debug) console.error(`shot.mjs: server warm after ${Date.now() - at}ms`);
  } catch (err) {
    // Not fatal: the navigation below will produce the real error if it matters.
    console.error(`shot.mjs: warm-up request failed (${err.message}), navigating anyway`);
  }
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
// 90s, not 30s: a cold Next dev route on a loaded machine kept the document in
// "loading" for more than half a minute (measured 2026-08-03).
const READY_CAP_MS = 90_000;

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

// Measuring the page is all that is normally needed. captureBeyondViewport paints
// content that was never scrolled into view, and this site reveals nothing on
// scroll: its only IntersectionObserver is ScrollSpy, which highlights nav links
// (checked 2026-08-03). So no walk, no forced relayout, no waiting.
const MEASURE_PAGE = 'document.documentElement.scrollHeight';

// --prime walks the page first, for the day a section does hide until seen. It is
// opt-in because it is expensive: at mobile width this page is tall enough that
// the walk cost minutes and blew past a 40s command timeout. The step has a floor
// and the walk an iteration cap because innerHeight came back as 0 in a headless
// context once, which made `y += step` advance by nothing and hang the run.
const PRIME_PAGE = `(async () => {
  const doc = document.documentElement;
  doc.style.scrollBehavior = 'auto';
  const maxSteps = 40;
  const step = Math.max(400, Math.round((innerHeight || 800) * 0.9), Math.ceil(doc.scrollHeight / maxSteps));
  for (let i = 0; i <= maxSteps; i++) {
    const y = i * step;
    if (y > doc.scrollHeight) break;
    doc.scrollTop = y;
    await new Promise((r) => setTimeout(r, 40));
  }
  doc.scrollTop = 0;
  await new Promise((r) => setTimeout(r, 100));
  return doc.scrollHeight;
})()`;

const measure = (selector) => `(() => {
  const el = document.querySelector(${JSON.stringify(selector)});
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height };
})()`;

async function capture(cdp, sessionId, shot, pageHeight) {
  let clip;
  if (shot.selector) {
    const box = await evaluate(cdp, sessionId, measure(shot.selector));
    if (!box) throw new Error(`Selector not found on the page: ${shot.selector}`);
    // A little air around the section so the shot does not look cropped.
    const pad = 16;
    clip = {
      x: Math.max(0, box.x - pad),
      y: Math.max(0, box.y - pad),
      width: Math.min(shot.width, box.width + pad * 2),
      height: box.height + pad * 2,
      scale: 1,
    };
  } else if (shot.full) {
    clip = { x: 0, y: 0, width: shot.width, height: pageHeight, scale: 1 };
  }

  const { data } = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true,
    ...(clip && { clip }),
  }, sessionId);

  await mkdir(OUT_DIR, { recursive: true });
  const outPath = path.join(OUT_DIR, shot.out);
  await writeFile(outPath, Buffer.from(data, 'base64'));
  return outPath;
}

// Held at module scope so the watchdog below can take Chrome down with it.
let chrome = null;

async function main(args) {
  const profileDir = path.join(tmpdir(), `pharos-shot-${process.pid}`);
  const t0 = Date.now();
  const { proc, wsUrl } = await launchChrome(findChrome(), profileDir);
  chrome = proc;
  if (args.debug) console.error(`shot.mjs: chrome ready after ${Date.now() - t0}ms`);
  const cdp = connectCdp(wsUrl);
  const written = [];

  try {
    await cdp.ready;
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    await cdp.send('Page.enable', {}, sessionId);

    // State carried between shots, so an unchanged viewport or URL is not paid for
    // twice: re-navigating and re-priming is most of the per-shot cost.
    let loadedUrl = null;
    let metrics = null;
    let pageHeight = 0;

    for (const shot of args.shots) {
      const wantMetrics = `${shot.width}x${shot.height}@${shot.scale}${shot.mobile ? 'm' : ''}`;
      const viewportChanged = wantMetrics !== metrics;
      if (viewportChanged) {
        await cdp.send('Emulation.setDeviceMetricsOverride', {
          width: shot.width,
          height: shot.height,
          deviceScaleFactor: shot.scale,
          mobile: Boolean(shot.mobile),
          screenWidth: shot.width,
          screenHeight: shot.height,
        }, sessionId);
        metrics = wantMetrics;
      }

      const navigated = shot.url !== loadedUrl;
      if (navigated) {
        await warmUp(shot.url, args.debug);
        await cdp.send('Page.navigate', { url: shot.url }, sessionId, NAVIGATE_TIMEOUT_MS);
        await waitForDocument(cdp, sessionId, args.debug);
        await new Promise((r) => setTimeout(r, args.wait));
        loadedUrl = shot.url;
      }

      // Re-measure whenever the document or the viewport changed; only walk the
      // page when asked to, since that is the expensive part.
      if (navigated || viewportChanged) {
        pageHeight = await evaluate(cdp, sessionId, args.prime ? PRIME_PAGE : MEASURE_PAGE);
      }

      const at = Date.now();
      written.push(await capture(cdp, sessionId, shot, pageHeight));
      if (args.debug) console.error(`shot.mjs: ${shot.out} in ${Date.now() - at}ms (${wantMetrics})`);
    }
  } finally {
    try { await cdp.send('Browser.close'); } catch {}
    cdp.close();
    proc.kill();
    await rm(profileDir, { recursive: true, force: true }).catch(() => {});
  }

  for (const p of written) console.log(p);
  if (args.debug) console.error(`shot.mjs: ${written.length} image(s) in ${Date.now() - t0}ms total`);
}

let parsed;
try {
  parsed = parseArgs(process.argv.slice(2));
} catch (err) {
  console.error(`shot.mjs: ${err.message}`);
  process.exit(1);
}

// Deliberately NOT unref'd: this is the last line of defence against a run that
// hangs, so it has to keep the process alive long enough to fire and say why.
const budgetMs = BUDGET_BASE_MS + BUDGET_PER_SHOT_MS * parsed.shots.length;
const guard = setTimeout(() => {
  console.error(`shot.mjs: gave up after ${Math.round(budgetMs / 1000)}s, killing chrome`);
  chrome?.kill();
  process.exit(1);
}, budgetMs);

main(parsed)
  .then(() => clearTimeout(guard))
  .catch((err) => {
    clearTimeout(guard);
    console.error(`shot.mjs: ${err.message}`);
    process.exit(1);
  });
