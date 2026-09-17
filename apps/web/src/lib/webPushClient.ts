/**
 * Browser half of "Enable browser push" (P102, issue #1), kept free of React and of the real
 * browser globals so the ORDER of its steps can be unit-tested.
 *
 * The order is the whole point. iOS/iPadOS WebKit only shows the notification prompt when
 * Notification.requestPermission() runs while the tap's user gesture is still live, and it
 * refuses pushManager.subscribe() without a gesture while permission is still "default".
 * The first version registered the service worker and awaited `ready` BEFORE asking, so on an
 * iPhone home-screen app the gesture had expired by then: no prompt ever appeared. Desktop
 * Chrome is lenient about this, which is why it only showed up on a real phone.
 *
 * So permission is asked FIRST, synchronously inside the click handler, and every network
 * step (worker registration, VAPID key, saving the subscription) happens after it.
 */

export type PushPermission = 'default' | 'granted' | 'denied';

export interface PushSubscriptionLike {
  toJSON(): { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
}

export interface EnableWebPushDeps {
  /** Current Notification.permission, read synchronously before anything is awaited. */
  permission: PushPermission;
  requestPermission: () => Promise<PushPermission>;
  /** Register /sw.js and resolve once it is active. */
  registerWorker: () => Promise<{
    subscribe: (opts: { userVisibleOnly: true; applicationServerKey: Uint8Array<ArrayBuffer> }) => Promise<PushSubscriptionLike>;
  }>;
  getPublicKey: () => Promise<{ publicKey: string }>;
  save: (sub: { endpoint: string; keys: { p256dh: string; auth: string } }) => Promise<{ ok: boolean; error?: string }>;
}

export type EnableWebPushResult = { ok: true; message: string } | { ok: false; message: string };

/** VAPID public key (base64url) → the Uint8Array the Push API wants as applicationServerKey. */
export function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  // Build on an explicit ArrayBuffer (not ArrayBufferLike) so it satisfies BufferSource.
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export async function enableWebPush(deps: EnableWebPushDeps): Promise<EnableWebPushResult> {
  // Must stay the first awaited call: see the file comment. Skipped when already granted, so
  // a re-subscribe does not depend on the gesture at all.
  const perm = deps.permission === 'granted' ? 'granted' : await deps.requestPermission();
  if (perm !== 'granted') {
    return { ok: false, message: 'Permission denied — allow notifications for this site in your browser.' };
  }
  const reg = await deps.registerWorker();
  const { publicKey } = await deps.getPublicKey();
  if (!publicKey) return { ok: false, message: 'Could not set up push on the server.' };
  const sub = await reg.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) });
  const json = sub.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    return { ok: false, message: 'Subscription was incomplete — try again.' };
  }
  const r = await deps.save({ endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } });
  return r.ok
    ? { ok: true, message: 'Browser push enabled ✓' }
    : { ok: false, message: r.error || 'Could not save the subscription.' };
}
