'use server';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { PushSubscription } from '@/models/PushSubscription';
import { withRequestTenant } from '@/lib/tenancy/request';
import { currentModel } from '@/lib/tenancy/connection';
import { assertCanWrite } from '@/lib/auth';
import { getOrCreateVapid, getWebPushPublicKey, dispatchWebPush } from '@/lib/webPush';

/**
 * Client-facing halves of Web Push (P102). The heavy lifting (VAPID keypair, payload
 * signing, pruning) lives in lib/webPush.ts; these just let the Settings toggle read the
 * public key and register/unregister this browser's subscription.
 *
 * Kept in its own file rather than the 2000-line settings/actions.ts, matching
 * calendarFeedActions / updateCheckActions / mcpActions.
 */

/** The applicationServerKey the browser needs, generating the tenant's VAPID keypair on
 *  first call. A write (assertCanWrite), because enabling push is the act of creating it. */
export async function getWebPushKey(): Promise<{ publicKey: string }> {
  await assertCanWrite();
  const cfg = await getOrCreateVapid();
  return { publicKey: cfg.publicKey };
}

/** Whether web push is already set up (a keypair exists) — read-only, for first paint. */
export async function getWebPushEnabled(): Promise<{ configured: boolean }> {
  const publicKey = await getWebPushPublicKey(false);
  return { configured: !!publicKey };
}

const SubSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});

/** Register (or refresh) this browser's push subscription. Upsert by endpoint, so
 *  re-subscribing the same browser never piles up duplicate rows. */
export async function savePushSubscription(
  raw: z.input<typeof SubSchema>,
  userAgent = ''
): Promise<{ ok: boolean; error?: string }> {
  await assertCanWrite();
  const parsed = SubSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'Invalid subscription' };
  const sub = parsed.data;
  return withRequestTenant(async () => {
    await connectDB();
    const Subs = await currentModel(PushSubscription);
    await Subs.updateOne(
      { endpoint: sub.endpoint },
      { $set: { keys: sub.keys, userAgent: userAgent.slice(0, 300) } },
      { upsert: true }
    );
    return { ok: true };
  });
}

/** Unregister a browser's subscription (the toggle turned off, or permission revoked). */
export async function deletePushSubscription(endpoint: string): Promise<{ ok: boolean }> {
  await assertCanWrite();
  if (!endpoint) return { ok: false };
  return withRequestTenant(async () => {
    await connectDB();
    const Subs = await currentModel(PushSubscription);
    await Subs.deleteOne({ endpoint });
    return { ok: true };
  });
}

/** Send a one-off test push to every registered subscription (the Test button). */
export async function testWebPush(): Promise<{ ok: boolean; sent: number }> {
  await assertCanWrite();
  const r = await withRequestTenant(() =>
    dispatchWebPush('Pharos test', 'Browser push is working — alerts will arrive here.')
  );
  return { ok: r.sent > 0, sent: r.sent };
}
