# Pharos Mobile (Expo)

A native iOS/Android client for Pharos, built on the Pharos **REST API v1** (see `../../API.md`).
This is the foundation: **login → dashboard → shopping list with AI photo scan**. More screens
(receipts, expenses, tasks…) plug into the same `src/api.ts` client.

## Run it

```bash
cd apps/mobile
npm install            # if you haven't already
npx expo start         # then scan the QR with Expo Go (iOS/Android)
```

In the app's **login screen**, set the **Server** field to your Pharos host
(e.g. `http://192.168.10.5:3000` on the LAN, or your tunnel URL), then sign in with your
Pharos username + password. The bearer token is stored with `expo-secure-store`.

> The default server URL lives in `src/config.ts` (`DEFAULT_API_BASE`) — change it to your
> LAN IP so you don't have to type it every time. `localhost` will NOT work from a phone;
> use the computer's LAN IP or a tunnel.

## What's wired

| Screen | API |
|--------|-----|
| Login | `POST /api/v1/auth/login` → bearer token (SecureStore) |
| Dashboard | `GET /api/v1/overview` (counts + installments owed), pull-to-refresh |
| Shopping list | `GET/POST /api/v1/shopping-list`, `PATCH/DELETE /api/v1/shopping-list/:id` |
| Scan a product | camera → `POST /api/v1/scan/product` → confirm → add |

## Structure

```
App.tsx              session gate + tab switch (Dashboard / Shopping) + sign-out
src/config.ts        default server URL + SecureStore keys
src/api.ts           typed fetch client (token storage, all endpoints)
src/theme.ts         Pharos palette
src/screens/         LoginScreen, DashboardScreen, ShoppingScreen
```

## Notes
- Needs the Pharos server reachable from the phone (same Wi-Fi, or a tunnel). The API token is
  the same one used by the MCP connector (Settings → Mobile / MCP regenerates/revokes it).
- Camera scan needs camera permission (prompted on first use).
- Built against Expo SDK 56. `npx tsc --noEmit` passes; run on a device/simulator to exercise it.
