import webpush from 'web-push';
import { connectDB } from './db';
import { AppConfig } from '@/models/AppConfig';
import { PushSubscription } from '@/models/PushSubscription';
import { currentModel } from './tenancy/connection';

/**
 * Native Web Push (P102) — the one notifier channel that talks to no third-party server
 * of ours. The browser hands us a subscription (endpoint + keys); we sign an encrypted
 * payload with a VAPID keypair generated once and stored on AppConfig, and POST it to the
 * subscription's push service (Mozilla/Google/Apple), which wakes the service worker.
 *
 * All tenant-scoped: the VAPID keypair and the subscriptions both live in the current
 * tenant's database, so one household's devices never receive another's alerts.
 */

export type VapidConfig = { publicKey: string; privateKey: string; subject: string };

/** VAPID `sub` must be a mailto: or an https URL. A self-host default is fine — push
 *  services only use it as a contact if they need to reach the sender. */
const DEFAULT_VAPID_SUBJECT = 'mailto:pharos@localhost';

type WebPushDoc = { webPush?: Partial<VapidConfig> };

/** True once a VAPID keypair exists — i.e. "Enable browser push" has been pressed. */
export function isWebPushConfigured(cfg: Partial<VapidConfig> | undefined | null): boolean {
  return !!(cfg && cfg.publicKey && cfg.privateKey);
}

/**
 * The VAPID keypair for this tenant, generating and persisting one on first use. Returns
 * only after a keypair is on the config, so the caller can hand `publicKey` to a browser
 * that is about to subscribe. The private key never leaves the server.
 */
export async function getOrCreateVapid(): Promise<VapidConfig> {
  await connectDB();
  const Config = await currentModel(AppConfig);
  const doc = (await Config.findOne({ key: 'singleton' }).select('webPush').lean()) as WebPushDoc | null;
  const existing = doc?.webPush;
  if (isWebPushConfigured(existing)) {
    return {
      publicKey: existing!.publicKey!,
      privateKey: existing!.privateKey!,
      subject: existing!.subject || DEFAULT_VAPID_SUBJECT,
    };
  }
  const keys = webpush.generateVAPIDKeys();
  const cfg: VapidConfig = { publicKey: keys.publicKey, privateKey: keys.privateKey, subject: DEFAULT_VAPID_SUBJECT };
  await Config.updateOne({ key: 'singleton' }, { $set: { webPush: cfg } }, { upsert: true });
  return cfg;
}

/** The public applicationServerKey a browser needs to subscribe, or '' if not set up and
 *  `create` is false. Read-only path for the client toggle. */
export async function getWebPushPublicKey(create: boolean): Promise<string> {
  if (create) return (await getOrCreateVapid()).publicKey;
  await connectDB();
  const Config = await currentModel(AppConfig);
  const doc = (await Config.findOne({ key: 'singleton' }).select('webPush.publicKey').lean()) as WebPushDoc | null;
  return doc?.webPush?.publicKey || '';
}

/**
 * Deliver one alert to every stored subscription for this tenant. Never throws.
 *
 * Returns {sent, total} in the same shape dispatchAlert uses, so the caller can fold web
 * push into its channel counts. Expired/unsubscribed endpoints (404/410 from the push
 * service) are pruned here, silently — the P102 MVP has no stale-subscription UI.
 */
export async function dispatchWebPush(title: string, message: string): Promise<{ sent: number; total: number }> {
  try {
    await connectDB();
    const Config = await currentModel(AppConfig);
    const doc = (await Config.findOne({ key: 'singleton' }).select('webPush').lean()) as WebPushDoc | null;
    const cfg = doc?.webPush;
    if (!isWebPushConfigured(cfg)) return { sent: 0, total: 0 };

    webpush.setVapidDetails(cfg!.subject || DEFAULT_VAPID_SUBJECT, cfg!.publicKey!, cfg!.privateKey!);

    const Subs = await currentModel(PushSubscription);
    const subs = (await Subs.find().select('endpoint keys').lean()) as Array<{
      _id: unknown;
      endpoint: string;
      keys?: { p256dh?: string; auth?: string };
    }>;
    if (subs.length === 0) return { sent: 0, total: 0 };

    const payload = JSON.stringify({ title, body: message });
    const expired: unknown[] = [];
    let sent = 0;

    await Promise.all(
      subs.map(async (s) => {
        if (!s.endpoint || !s.keys?.p256dh || !s.keys?.auth) {
          expired.push(s._id); // malformed row — clear it out
          return;
        }
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth } },
            payload,
            { TTL: 60 * 60 } // hold for up to an hour if the device is offline
          );
          sent++;
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode;
          // 404 = endpoint gone, 410 = subscription expired/unsubscribed → prune.
          if (status === 404 || status === 410) expired.push(s._id);
          // Any other error (transient push-service hiccup) is left alone for next time.
        }
      })
    );

    if (expired.length) await Subs.deleteMany({ _id: { $in: expired as string[] } });
    return { sent, total: subs.length };
  } catch {
    // Best-effort, exactly like the other channels: a broken push send must never fail
    // the whole alert dispatch.
    return { sent: 0, total: 0 };
  }
}
