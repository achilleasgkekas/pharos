'use client';
import { useEffect, useState } from 'react';
import { Loader2, BellRing, BellOff } from 'lucide-react';
import { cn } from '@/components/ui/cn';
import { getWebPushKey, savePushSubscription, deletePushSubscription, testWebPush } from './webPushActions';

/**
 * P102: "Enable browser push" — the one notifier channel that needs no external account.
 * Registers the minimal service worker (public/sw.js), asks for notification permission,
 * subscribes via the tenant's VAPID public key, and stores the subscription server-side.
 *
 * English-only strings, matching the rest of the Notifications section (which does not go
 * through i18n). One subscription per browser/device (P102 MVP).
 */

/** VAPID public key (base64url) → the Uint8Array the Push API wants as applicationServerKey. */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  // Build on an explicit ArrayBuffer (not ArrayBufferLike) so it satisfies BufferSource.
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function WebPushToggle() {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      setSupported(false);
      return;
    }
    setSupported(true);
    navigator.serviceWorker
      .getRegistration()
      .then((reg) => reg?.pushManager.getSubscription())
      .then((sub) => setSubscribed(!!sub))
      .catch(() => {});
  }, []);

  async function enable() {
    setBusy(true);
    setMsg('');
    try {
      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        setMsg('Permission denied — allow notifications for this site in your browser.');
        return;
      }
      const { publicKey } = await getWebPushKey();
      if (!publicKey) {
        setMsg('Could not set up push on the server.');
        return;
      }
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        setMsg('Subscription was incomplete — try again.');
        return;
      }
      const r = await savePushSubscription(
        { endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } },
        navigator.userAgent
      );
      if (r.ok) {
        setSubscribed(true);
        setMsg('Browser push enabled ✓');
      } else {
        setMsg(r.error || 'Could not save the subscription.');
      }
    } catch (e) {
      setMsg((e as Error)?.message || 'Could not enable browser push.');
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setMsg('');
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await deletePushSubscription(sub.endpoint);
        await sub.unsubscribe();
      }
      setSubscribed(false);
      setMsg('Browser push disabled.');
    } catch (e) {
      setMsg((e as Error)?.message || 'Could not disable browser push.');
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    setMsg('');
    try {
      const r = await testWebPush();
      setMsg(r.sent > 0 ? 'Test push sent ✓' : 'No devices received it — is push still allowed?');
    } finally {
      setBusy(false);
    }
  }

  if (supported === false) {
    return (
      <div className="pt-3 border-t border-[color:var(--color-border)]">
        <p className="text-xs text-[color:var(--color-text-faint)]">
          Browser push isn&apos;t supported here (needs a modern browser over HTTPS, or install the app).
        </p>
      </div>
    );
  }

  return (
    <div className="pt-3 border-t border-[color:var(--color-border)] space-y-2">
      <p className="text-xs text-[color:var(--color-text-dim)]">
        Browser push — get alerts on this device with no external account. Works even when the tab is closed once you
        allow notifications. Per browser/device; each device opts in on its own.
      </p>
      <div className="flex items-center gap-2 flex-wrap">
        {subscribed ? (
          <button
            type="button"
            onClick={disable}
            disabled={busy}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)] disabled:opacity-50"
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : <BellOff size={13} />} Disable browser push
          </button>
        ) : (
          <button
            type="button"
            onClick={enable}
            disabled={busy}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-[color:var(--color-surface-2)] border border-[color:var(--color-accent)] text-[color:var(--color-accent)] hover:opacity-80 disabled:opacity-50"
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : <BellRing size={13} />} Enable browser push
          </button>
        )}
        {subscribed && (
          <button
            type="button"
            onClick={test}
            disabled={busy}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)] disabled:opacity-50"
          >
            Send test
          </button>
        )}
      </div>
      {msg && (
        <p
          className={cn(
            'text-[11px]',
            msg.includes('✓') ? 'text-[color:var(--color-accent)]' : 'text-[color:var(--color-text-faint)]'
          )}
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          {msg}
        </p>
      )}
    </div>
  );
}
