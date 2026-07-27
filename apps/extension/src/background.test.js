/**
 * Wiring tests for the MV3 service worker. There is no browser here, so a fake
 * `chrome` namespace is installed before importing background.js, the listeners it
 * registers are captured, and then invoked the way the browser would. This covers
 * the part that pure helpers cannot: which trigger opens what, and what happens
 * when the instance address is missing or the page is not capturable.
 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const listeners = {};
const state = { stored: {}, windows: [], optionsOpened: 0, menus: [], badges: [] };

globalThis.chrome = {
  storage: { sync: { get: async () => ({ origin: state.stored.origin }) } },
  windows: { create: async (opts) => void state.windows.push(opts) },
  tabs: { create: async () => {} },
  runtime: {
    openOptionsPage: async () => void state.optionsOpened++,
    onInstalled: { addListener: (fn) => (listeners.installed = fn) },
  },
  action: {
    onClicked: { addListener: (fn) => (listeners.action = fn) },
    setBadgeText: async (o) => void state.badges.push(o.text),
    setBadgeBackgroundColor: async () => {},
  },
  contextMenus: {
    removeAll: async () => void (state.menus = []),
    create: (m) => void state.menus.push(m),
    onClicked: { addListener: (fn) => (listeners.menu = fn) },
  },
};

await import('./background.js');

beforeEach(() => {
  state.stored = { origin: 'https://pharos.example.com' };
  state.windows = [];
  state.optionsOpened = 0;
  state.badges = [];
});

test('the toolbar click opens /capture for the active tab', async () => {
  await listeners.action({ url: 'https://shop.gr/product/1' });
  assert.equal(state.windows.length, 1);
  assert.equal(
    state.windows[0].url,
    'https://pharos.example.com/capture?url=https%3A%2F%2Fshop.gr%2Fproduct%2F1',
  );
  assert.equal(state.windows[0].type, 'popup');
});

test('a stored address with a trailing slash still yields one slash', async () => {
  state.stored = { origin: 'https://pharos.example.com/' };
  await listeners.action({ url: 'https://shop.gr/p' });
  assert.ok(state.windows[0].url.startsWith('https://pharos.example.com/capture?'));
});

test('no configured instance opens the options page instead of a window', async () => {
  state.stored = {};
  await listeners.action({ url: 'https://shop.gr/p' });
  assert.equal(state.windows.length, 0);
  assert.equal(state.optionsOpened, 1);
});

test('a browser-internal page is refused with a badge, not an empty capture', async () => {
  await listeners.action({ url: 'chrome://extensions' });
  assert.equal(state.windows.length, 0);
  assert.deepEqual(state.badges, ['!']);
});

test('the link context menu captures the link target, not the page', async () => {
  await listeners.menu(
    { menuItemId: 'pharos-capture-link', linkUrl: 'https://shop.gr/deal', pageUrl: 'https://blog.gr/post' },
    { url: 'https://blog.gr/post' },
  );
  assert.equal(new URL(state.windows[0].url).searchParams.get('url'), 'https://shop.gr/deal');
});

test('the page context menu captures the page', async () => {
  await listeners.menu(
    { menuItemId: 'pharos-capture-page', pageUrl: 'https://shop.gr/product/2' },
    { url: 'https://shop.gr/product/2' },
  );
  assert.equal(new URL(state.windows[0].url).searchParams.get('url'), 'https://shop.gr/product/2');
});

test('install creates exactly the two context menus', async () => {
  await listeners.installed({ reason: 'update' });
  assert.deepEqual(
    state.menus.map((m) => m.id),
    ['pharos-capture-page', 'pharos-capture-link'],
  );
  assert.deepEqual(
    state.menus.map((m) => m.contexts[0]),
    ['page', 'link'],
  );
});

test('a first install with nothing configured opens the options page', async () => {
  state.stored = {};
  await listeners.installed({ reason: 'install' });
  assert.equal(state.optionsOpened, 1);
});

test('an update does not nag with the options page', async () => {
  state.stored = {};
  await listeners.installed({ reason: 'update' });
  assert.equal(state.optionsOpened, 0);
});
