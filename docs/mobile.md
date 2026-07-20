# Mobile app

Pharos ships a native iOS/Android companion built with [Expo](https://expo.dev)
(SDK 54). It talks to your Pharos server entirely over the public **REST API v1**
(see [API reference](api.md)), so it needs nothing special server-side beyond a
reachable instance and your normal Pharos login.

The app lives in the monorepo at `apps/mobile`.

---

## What it does

The mobile app mirrors most of the web modules, backed by the same API client
(`apps/mobile/src/api.ts`):

| Area | Screen |
|------|--------|
| Dashboard | counts, installments owed, quick links (pull-to-refresh) |
| AI assistant | conversational command bar (`POST /api/v1/ai`) |
| Shopping list | add/check/delete + **camera product scan** |
| Receipts | list, detail, camera scan + AI parse, re-scan, add to library |
| Inventory (Items) | list, detail, price status, log a price, link installment plans |
| Expenses / Income | list, add, edit, bill/payslip AI scan |
| Subscriptions | list, add, edit, **auto-discover untracked recurring charges** |
| Statements | list + transactions, installment-plan overview |
| Vouchers | list, add, edit, AI fill (text/photo) |
| Calendar | 3-month agenda of renewals, installments, bills, expiries |
| Reports | net position, this month/year, by-category, budgets |
| Tasks | list, add, status, steps |
| Search | global search across records |
| Activity | background AI jobs, saved AI conversations, notifications |
| Settings | preferences, budgets, cards, stores, lists, sign-out |

Navigation is a top app bar (menu, search, notification bell with unread badge)
plus a slide-out drawer. There are no native tabs; screens switch from the drawer.

---

## Requirements

- **A running Pharos server** reachable from the phone. On the same Wi-Fi use the
  computer's LAN IP (e.g. `http://192.168.10.5:3000`); over the internet use your
  tunnel/reverse-proxy URL. `localhost` will **not** work from a phone.
- **A Pharos user account** (username + password). The bearer token is created on
  first login and stored on-device with `expo-secure-store`.
- For development: **Node.js 20+** and the **Expo Go** app on your phone (iOS App
  Store / Google Play), or an Android/iOS simulator.

---

## Run it (development)

```bash
cd apps/mobile
npm install        # first time only
npx expo start     # then scan the QR code with Expo Go
```

Scan the printed QR code with **Expo Go** (Android) or the Camera app (iOS). The
app opens on the **login screen**:

1. Set the **Server** field to your Pharos host (LAN IP or tunnel URL).
2. Sign in with your Pharos **username + password**.

The session (base URL + bearer token + user) is persisted in secure storage, so
you only enter it once. Sign-out clears the token and unregisters push.

> **Tip — set your default server.** Edit `DEFAULT_API_BASE` in
> `apps/mobile/src/config.ts` to your LAN IP so it is prefilled on the login
> screen. It ships pointing at a placeholder address; change it for your network.

Other scripts (from `package.json`): `npm run android`, `npm run ios`,
`npm run web`. Type-check with `npx tsc --noEmit`.

---

## How the token works

There is **no separate token step** for the mobile app: `POST /api/v1/auth/login`
with your username and password returns the user's bearer token (a `phk_…`
string), which the app then sends as `Authorization: Bearer <token>` on every
request. This is the same token the API and MCP connector use; it is created on
first login and can be regenerated/revoked from the web app under
**Settings → Mobile / MCP**. See the [API reference](api.md#authentication) for
the raw request/response.

Bearer-protected files (receipt images, item photos, thumbnails) are fetched via
`/api/files/<path>` with the same header, so images load inside the app.

---

## Camera and AI scans

Several screens can scan with the camera and let the AI prefill a form:

- **Shopping list** → product scan (`POST /api/v1/scan/product`).
- **Receipts** → receipt scan + AI parse (`POST /api/v1/scan/receipt`), plus
  re-scan of a stored file.
- **Expenses** → bill/payslip scan (`POST /api/v1/scan/expense`).
- **Vouchers** → voucher scan (`POST /api/v1/scan/voucher`).

Camera access is requested on first use (declared in `app.json` via the
`expo-image-picker` plugin). These endpoints require AI to be configured and
enabled on the server; if AI is off they return an error and you can still add
records manually. See [Configuration → AI providers](configuration.md).

---

## Push notifications

Push is fully wired but **off until you make a real build**:

- The app (`src/push.ts`) requests permission, fetches an Expo push token, and
  registers it via `POST /api/v1/push/register`. It is guarded end-to-end, so in
  Expo Go, on a simulator, or without EAS credentials it simply no-ops and
  nothing breaks.
- The server stores tokens on the user and pushes every alert (deals,
  installments, warranties) to registered devices through Expo's push service,
  alongside any configured notifiers.

Enabling real delivery requires a development build and an Apple push key (iOS),
which Expo Go cannot provide since SDK 53. The one-time steps are documented in
`apps/mobile/PUSH_SETUP.md`. In short: a free Expo account plus the paid Apple
Developer Program, then:

```bash
npm install -g eas-cli
cd apps/mobile
eas login
eas init                                       # writes projectId into app.json
eas build --profile development --platform ios # answer "Yes" to generate an APNs key
```

Install the build, open it, sign in — the app registers a real push token
automatically. Verify from the web app: **Settings → Notifications → "Check &
notify now"**.

---

## Building installable binaries (EAS)

Expo Go is for development only. For real installable apps, use
[EAS Build](https://docs.expo.dev/build/introduction/) (`eas.json` ships with
`development`, `preview`, and `production` profiles; bundle id
`com.achilleas.pharos`):

```bash
npm install -g eas-cli    # once
eas login                 # your Expo account
eas build --profile preview --platform android   # → installable .apk
eas build --profile preview --platform ios       # → ad-hoc / TestFlight (needs Apple account)
```

`preview` produces internal-distribution builds (APK / ad-hoc). `production` plus
`eas submit` publishes to the stores. Builds run on Expo's servers (~10-20 min)
and are a user-run step.

> If you fork/self-host, change the bundle identifier in `app.json` and
> `eas.json` to your own reverse-DNS id before building for the stores.

---

## Project layout

```
apps/mobile/
  App.tsx              session gate + app bar + drawer + screen switch + sign-out
  index.ts             Expo entry point
  app.json             Expo config (name, icons, plugins, permissions)
  eas.json             EAS build/submit profiles
  src/
    config.ts          DEFAULT_API_BASE + SecureStore keys
    api.ts             typed fetch client (token storage, all /api/v1 calls)
    push.ts            Expo push registration (guarded)
    theme.ts           Pharos palette
    nav.tsx            app bar + drawer
    ui.tsx             shared UI primitives
    PharosMark.tsx     logo mark
    screens/           one file per screen (Home, Shopping, Receipts, …)
```

To add a screen: implement it in `src/screens/`, add its calls to `src/api.ts`,
and wire it into the switch and drawer in `App.tsx`.

---

## Troubleshooting

- **Can't connect / network error.** Confirm the server is reachable from the
  phone (same Wi-Fi or a working tunnel) and the **Server** URL includes the
  scheme and port (`http://…:3000`). `localhost` never works from a device.
- **Login fails.** Use your Pharos username (lowercased server-side) and
  password. If you have no account yet, complete the first-run admin setup in the
  web app (see [Self-hosting](self-hosting.md)).
- **Images don't load.** They are bearer-protected; make sure you are signed in.
  A stale token (after regenerating it in Settings) means signing out and back in.
- **AI scans return an error.** AI must be configured and enabled on the server;
  see [Configuration](configuration.md).
- **No push notifications.** Expected in Expo Go / simulators. Follow
  `apps/mobile/PUSH_SETUP.md` and make a development build.
