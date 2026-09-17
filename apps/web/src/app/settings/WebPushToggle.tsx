'use client';
import { useEffect, useState } from 'react';
import { Loader2, BellRing, BellOff } from 'lucide-react';
import { cn } from '@/components/ui/cn';
import { getWebPushKey, savePushSubscription, deletePushSubscription, testWebPush } from './webPushActions';
import { enableWebPush } from '@/lib/webPushClient';

/**
 * P102: "Enable browser push" — the one notifier channel that needs no external account.
 * Asks for permission, registers the minimal service worker (served by app/sw.js/route.ts),
 * subscribes via the tenant's VAPID public key, and stores the subscription server-side.
 * The step order lives in lib/webPushClient.ts, where it is tested (issue #1, iOS).
 *
 * English-only strings, matching the rest of the Notifications section (which does not go
 * through i18n). One subscription per browser/device (P102 MVP).
 */

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
      // enableWebPush asks for permission before its first await, so this call has to stay
      // directly in the click handler with nothing awaited ahead of it (iOS drops the gesture).
      const r = await enableWebPush({
        permission: Notification.permission,
        requestPermission: () => Notification.requestPermission(),
        registerWorker: async () => {
          await navigator.serviceWorker.register('/sw.js');
          const reg = await navigator.serviceWorker.ready;
          return { subscribe: (opts) => reg.pushManager.subscribe(opts) };
        },
        getPublicKey: getWebPushKey,
        save: (sub) => savePushSubscription(sub, navigator.userAgent),
      });
      if (r.ok) setSubscribed(true);
      setMsg(r.message);
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
