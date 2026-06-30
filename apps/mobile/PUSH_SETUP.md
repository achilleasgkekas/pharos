# Push notifications — one-time setup (Achilleas)

The whole push pipeline is already built and verified:

- **App side**: `src/push.ts` requests permission, fetches an Expo push token, and
  registers it via `POST /api/v1/push/register`. It is fully guarded — in Expo Go /
  on a simulator / without EAS it just no-ops, so nothing breaks today.
- **Server side**: tokens are stored on `User.pushTokens`; `runAlertChecks` pushes
  every alert (deals / installments / warranties) to all registered devices via
  Expo's push service (`lib/expoPush.ts`), alongside ntfy.
- `app.json` already lists the `expo-notifications` plugin, and `eas.json` already
  has a `development` profile.

The only thing missing is a real iOS push token, which Expo Go cannot provide since
SDK 53. That needs a dev build + an Apple push key.

Prerequisites: a free Expo account (expo.dev) and the paid Apple Developer Program
(APNs keys require it).

Run these one at a time (zsh does NOT treat `#` as a comment, so don't paste
comment lines):

```bash
npm install -g eas-cli
cd ~/Desktop/homepage/apps/mobile
eas login
eas init
eas build --profile development --platform ios
```

- `eas init` links the project and writes the `projectId` into `app.json`.
- During `eas build`, when asked **"Generate a new Apple Push Notifications service
  key?"** answer **Yes** (or pre-create one: Apple Developer → Certificates, IDs &
  Profiles → Keys → + → Apple Push Notifications service; `eas credentials` uploads it).
- Then install the build on your iPhone, open it, sign in. `registerForPush()` gets a
  real `ExponentPushToken` and registers it automatically.

Verify end-to-end: open the app once (grant the notification permission prompt),
then in the web app go to **Settings → Notifications → "Check & notify now"** — the
alert should arrive as a push on the phone.

No code changes are needed after this; the pipeline delivers automatically.
