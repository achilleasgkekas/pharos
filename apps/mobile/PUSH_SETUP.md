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
SDK 53. That needs a dev build + an Apple push key. One time:

```bash
cd apps/mobile

# 1. Log in + link the project (creates the EAS projectId in app.json)
npx eas login
npx eas init

# 2. Build a development client for your iPhone (installs over USB / QR)
npx eas build --profile development --platform ios
#    When prompted "Generate a new Apple Push Notifications service key?" → Yes.
#    (Or pre-create one: Apple Developer → Certificates, IDs & Profiles → Keys →
#     + → Apple Push Notifications service (APNs). `eas credentials` uploads it.)

# 3. Install the build on your phone, open it, sign in.
#    registerForPush() then gets a real ExponentPushToken and registers it.
```

Verify end-to-end: open the app once (grant the notification permission prompt),
then in the web app go to **Settings → Notifications → "Check & notify now"** — the
alert should arrive as a push on the phone.

No code changes are needed after this; the pipeline delivers automatically.
