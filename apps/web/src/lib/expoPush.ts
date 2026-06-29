import { connectDB } from '@/lib/db';
import { User } from '@/models/User';

/** A token looks like ExponentPushToken[xxxx] or ExpoPushToken[xxxx]. */
export function isExpoPushToken(t: unknown): t is string {
  return typeof t === 'string' && /^Expo(nent)?PushToken\[[^\]]+\]$/.test(t.trim());
}

type ExpoMessage = { to: string; title: string; body: string; sound: 'default'; data?: Record<string, unknown> };

/**
 * Send a push to a set of Expo push tokens via Expo's push service.
 * No Apple/FCM credentials are needed on this side — Expo's service fans out to
 * APNs/FCM once the device has a real token (from an EAS build). Never throws.
 * Returns the number of messages accepted by Expo (best-effort).
 */
export async function sendExpoPush(
  tokens: string[],
  title: string,
  body: string,
  data?: Record<string, unknown>
): Promise<number> {
  const valid = Array.from(new Set(tokens.filter(isExpoPushToken)));
  if (!valid.length) return 0;
  const messages: ExpoMessage[] = valid.map((to) => ({ to, title, body: body.slice(0, 1000), sound: 'default', data }));

  let accepted = 0;
  // Expo accepts up to 100 messages per request.
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);
    try {
      const res = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(chunk),
      });
      const json = (await res.json().catch(() => null)) as { data?: Array<{ status?: string }> } | null;
      if (json?.data) accepted += json.data.filter((d) => d.status === 'ok').length;
    } catch {
      /* best-effort: a failed push must never break the caller (alert checks, etc.) */
    }
  }
  return accepted;
}

/** Push an alert to every registered device across all users. Fire-and-forget safe. */
export async function pushAllDevices(title: string, body: string, data?: Record<string, unknown>): Promise<number> {
  try {
    await connectDB();
    const users = (await User.find({ 'pushTokens.0': { $exists: true } }).select('pushTokens').lean()) as Array<{ pushTokens?: string[] }>;
    const tokens = users.flatMap((u) => u.pushTokens ?? []);
    return await sendExpoPush(tokens, title, body, data);
  } catch {
    return 0;
  }
}
