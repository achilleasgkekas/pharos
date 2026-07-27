/**
 * MV3 service worker — the whole extension, really.
 *
 * Three entry points (toolbar click, page context menu, link context menu) all
 * funnel into one action: open a small window on <your Pharos>/capture?url=...
 * That page is same-origin with the user's Pharos instance, so it rides the
 * session cookie that is already there; the extension itself stores no token,
 * requests no host permissions, and injects no content script.
 */
import { normalizeOrigin, captureUrl, isCapturable, POPUP_SIZE } from './shared.js';

const MENU_PAGE = 'pharos-capture-page';
const MENU_LINK = 'pharos-capture-link';

/** Configured instance origin, or '' when the options page has not been filled in yet. */
async function storedOrigin() {
  try {
    const { origin } = await chrome.storage.sync.get('origin');
    return normalizeOrigin(origin);
  } catch {
    return '';
  }
}

/** A badge is the only feedback available from a service worker with no UI. */
async function flashBadge(text, color) {
  try {
    await chrome.action.setBadgeBackgroundColor({ color });
    await chrome.action.setBadgeText({ text });
    setTimeout(() => chrome.action.setBadgeText({ text: '' }), 2500);
  } catch {
    // Badge APIs are cosmetic; never let them break a capture.
  }
}

async function capture(pageUrl) {
  const origin = await storedOrigin();
  if (!origin) {
    // Nothing to open until the user says where their Pharos lives.
    await chrome.runtime.openOptionsPage();
    return;
  }
  if (!isCapturable(pageUrl)) {
    await flashBadge('!', '#ffd93d');
    return;
  }
  await chrome.windows.create({
    url: captureUrl(origin, pageUrl),
    type: 'popup',
    width: POPUP_SIZE.width,
    height: POPUP_SIZE.height,
  });
}

// Toolbar button. Registered without a default_popup so the click reaches us here;
// `activeTab` is what makes tab.url readable, and only for the tab just clicked.
// The returned promise is ignored by the browser (these events take no response),
// but returning it instead of dropping it keeps the flow awaitable under test.
chrome.action.onClicked.addListener((tab) => capture(tab?.url || ''));

chrome.runtime.onInstalled.addListener(async (details) => {
  // Menus are declarative and survive worker restarts, so recreate them idempotently.
  try {
    await chrome.contextMenus.removeAll();
    chrome.contextMenus.create({ id: MENU_PAGE, title: 'Add this page to Pharos', contexts: ['page'] });
    chrome.contextMenus.create({ id: MENU_LINK, title: 'Add this link to Pharos', contexts: ['link'] });
  } catch {
    // A missing contextMenus permission should not stop the toolbar button working.
  }
  // First install with nothing configured: send the user straight to the one field
  // they must fill in, instead of a silent no-op on their first click.
  if (details.reason === 'install' && !(await storedOrigin())) await chrome.runtime.openOptionsPage();
});

chrome.contextMenus?.onClicked.addListener((info, tab) => {
  const url = info.menuItemId === MENU_LINK ? info.linkUrl : info.pageUrl || tab?.url || '';
  return capture(url);
});
