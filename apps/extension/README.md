# Pharos quick capture (browser extension)

One click on any product page sends that page to your own Pharos instance, into the same
preview-then-approve import the Items page uses. This is phase 2 of the quick-capture
feature; phase 1 is the bookmarklet you can already drag out of
**Settings → Storage & backup → Quick capture**.

## What it does

| Trigger | Result |
| --- | --- |
| Toolbar button | Opens `<your Pharos>/capture?url=<current page>` in a small window |
| Right-click a page → *Add this page to Pharos* | Same, for the page under the cursor |
| Right-click a link → *Add this link to Pharos* | Same, for the link target |

The capture window is a normal Pharos page, so it shows the AI preview (title, price,
store, specs) and the **Add to Shopping / Add to Inventory** buttons, and it merges into
an existing item when it recognises one.

## What it deliberately does not do

- **No API token.** Authentication is the session cookie you already have on your Pharos
  tab, because `/capture` is same-origin with your instance. Nothing secret is stored in
  the extension, so exporting or syncing your extension profile leaks nothing.
- **No host permissions, no content scripts.** The extension cannot read, or even see, the
  content of the pages you browse. It only receives the address of the tab you clicked on
  (`activeTab`, granted per click) and hands it to your instance.
- **No network calls of its own.** It opens a window; the browser does the rest.

Permissions used: `storage` (remember your instance address), `contextMenus` (the two
right-click entries), `activeTab` (read the URL of the tab you just clicked).

## Install (unpacked)

Chrome, Edge, Brave, Opera, Arc:

1. Open `chrome://extensions` and turn on **Developer mode**.
2. **Load unpacked** and pick this folder (`apps/extension`).
3. The options page opens on first install. Enter your Pharos address, for example
   `https://pharos.example.com` or `http://10.0.1.5:3000`, and press **Save**.
4. Sign in to Pharos once in the same browser. That is all the auth the extension needs.

Firefox loads MV3 extensions too (`about:debugging` → **This Firefox** → **Load Temporary
Add-on** → pick `manifest.json`), but it is not part of the tested path yet.

## Development

No build step and no dependencies: the source in `src/` is exactly what the browser runs.

```bash
npm test   # node --test over the pure helpers in src/shared.js
npm run pack   # zip a distributable, excluding tests and packaging metadata
```

After editing, press the reload button on the extension card in `chrome://extensions`.

`src/shared.js` holds the only logic worth testing (address normalisation, building the
`/capture` URL, refusing `chrome://` and `file://` pages). `src/background.js` is the MV3
service worker wiring the three triggers to it, and `src/options.html` + `src/options.js`
are the single-field settings page.
