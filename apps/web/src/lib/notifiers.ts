import { connectDB } from './db';
import { AppConfig } from '@/models/AppConfig';
import { currentModel } from './tenancy/connection';
import { sendNtfyTo } from './notify';
import { assertPublicUrl } from './ssrf';
import { safeFetch } from './safeFetch';
import { DEFAULT_SMTP_PORT, NOTIFIER_TYPES, smtpFields, type NotifierConfig, type NotifierType } from './notifiers.shared';
import { deliverWithRetry, describeOutcome, type DeliveryOutcome } from './deliveryRetry';
import { recordDeliveries } from './deliveryLog';
import { notifierLogKey } from './deliveryLog.shared';
import { dispatchWebPush } from './webPush';
import { sendPlainMail } from './mailer';

export { NOTIFIER_TYPES };
export type { NotifierConfig, NotifierType };

/**
 * Pluggable outbound notifier. Alerts (deals, installments due, expiring
 * warranties) fan out to every enabled channel. Every channel is a plain HTTP
 * POST except `email`, which talks SMTP through lib/mailer.ts.
 *
 * Channels live as an array on AppConfig.notifiers. ntfy is just one channel
 * type; the legacy ntfyUrl/ntfyEnabled fields are migrated in on read so older
 * setups keep working until the user saves from Settings.
 */

const TIMEOUT = 10000;

const MISSING_CONFIG: DeliveryOutcome = { ok: false, error: 'Missing configuration', permanent: true };

/** POST JSON and turn the response (or the failure) into a DeliveryOutcome. A rejected
 *  SSRF check is `permanent` — retrying a private/internal target can never succeed. */
async function toOutcome(send: () => Promise<Response>): Promise<DeliveryOutcome> {
  try {
    const res = await send();
    return res.ok ? { ok: true, ...(res.status ? { status: res.status } : {}) } : { ok: false, status: res.status, error: 'Rejected by receiver' };
  } catch (err) {
    return { ok: false, error: (err as Error)?.message || 'Network error' };
  }
}

function jsonInit(payload: unknown): RequestInit {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(TIMEOUT),
  };
}

/** A user-supplied webhook URL: refuse private/internal targets, and re-check every redirect
 *  (safeFetch) so a public URL cannot bounce the request to an internal host. */
async function postJson(url: string, payload: unknown): Promise<DeliveryOutcome> {
  try {
    await assertPublicUrl(url);
  } catch (err) {
    return { ok: false, error: (err as Error).message, permanent: true };
  }
  return toOutcome(() => safeFetch(url, jsonInit(payload)));
}

// Bot tokens look like `123456:AAH…`. Anything else (a slash, `?`, `#`, `@`, `%`) could steer
// the path or query of the request, so it is refused before any URL is built.
const TELEGRAM_TOKEN = /^[A-Za-z0-9:_-]+$/;

/** Telegram's host is fixed (api.telegram.org); only the validated token goes into the path. */
async function postTelegram(token: string, chatId: string, text: string): Promise<DeliveryOutcome> {
  if (!TELEGRAM_TOKEN.test(token)) return { ok: false, error: 'Invalid bot token', permanent: true };
  // Each half is URI-encoded around the literal colon. For a valid token that changes nothing,
  // but it keeps the path provably inert (and CodeQL can see that it is).
  const safeToken = token.split(':').map(encodeURIComponent).join(':');
  return toOutcome(() => fetch(`https://api.telegram.org/bot${safeToken}/sendMessage`, jsonInit({ chat_id: chatId, text })));
}

/** Send an alert over SMTP. A refused login (EAUTH) or a 5xx reply (bad sender or
 *  recipient) will fail the same way on every retry, so both are permanent; timeouts,
 *  refused connections and 4xx greylisting stay transient and get the normal backoff. */
async function sendEmail(c: NotifierConfig, subject: string, text: string): Promise<DeliveryOutcome> {
  if (!c.host || !c.target || !c.from) return MISSING_CONFIG;
  try {
    await sendPlainMail(
      { host: c.host, port: c.port || DEFAULT_SMTP_PORT, secure: !!c.secure, user: c.user, pass: c.pass, from: c.from },
      { to: c.target, subject, text }
    );
    return { ok: true };
  } catch (err) {
    const e = err as { message?: string; code?: string; responseCode?: number };
    const permanent = e.code === 'EAUTH' || (typeof e.responseCode === 'number' && e.responseCode >= 500);
    return { ok: false, error: (e.message || 'SMTP delivery failed').slice(0, 160), ...(permanent ? { permanent: true } : {}) };
  }
}

/** One delivery attempt. Title is ASCII-only for ntfy; the body keeps any unicode (e.g. Greek). */
async function attemptOne(c: NotifierConfig, title: string, message: string): Promise<DeliveryOutcome> {
  switch (c.type) {
    case 'ntfy': {
      if (!c.url) return MISSING_CONFIG;
      // sendNtfyTo swallows its own transport errors into a boolean; no status to report,
      // so a false is treated as transient (worth one retry) rather than permanent.
      const ok = await sendNtfyTo(c.url, title, message, { tags: ['bell'] });
      return ok ? { ok: true } : { ok: false, error: 'ntfy delivery failed' };
    }
    case 'discord':
      return c.url ? postJson(c.url, { content: `**${title}**\n${message}`.slice(0, 1900) }) : MISSING_CONFIG;
    case 'slack':
      return c.url ? postJson(c.url, { text: `*${title}*\n${message}` }) : MISSING_CONFIG;
    case 'telegram':
      // Host is the hardcoded api.telegram.org, not user-supplied → no SSRF guard needed.
      return c.token && c.target ? postTelegram(c.token, c.target, `${title}\n${message}`) : MISSING_CONFIG;
    case 'webhook':
      return c.url ? postJson(c.url, { title, message, ts: new Date().toISOString() }) : MISSING_CONFIG;
    case 'email':
      return sendEmail(c, title, message);
    default:
      return { ok: false, error: 'Unknown channel type', permanent: true };
  }
}

/** Send a one-off test to a single (possibly unsaved) channel config. Single attempt on
 *  purpose: the Test button is interactive, so a wrong URL should answer immediately
 *  instead of making the user wait out the backoff. */
export async function testNotifier(c: NotifierConfig): Promise<boolean> {
  return (await attemptOne(c, 'Pharos test', 'Notifications are working — alerts will arrive here.')).ok;
}

function coerce(raw: unknown, i: number): NotifierConfig | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const type = String(r.type || '') as NotifierType;
  if (!NOTIFIER_TYPES.some((t) => t.type === type)) return null;
  return {
    id: String(r.id || `n${i}`),
    type,
    enabled: r.enabled !== false,
    label: r.label ? String(r.label) : '',
    url: r.url ? String(r.url) : '',
    token: r.token ? String(r.token) : '',
    target: r.target ? String(r.target) : '',
    ...(type === 'email' ? smtpFields(r) : {}),
  };
}

/** Read configured channels. Migrates the legacy ntfy fields into a channel
 *  when the array is empty so existing setups keep notifying until they save. */
export async function getNotifiers(): Promise<NotifierConfig[]> {
  await connectDB();
  // Route to the current tenant's database (default tenant → AppConfig untouched), so one
  // tenant's notifier channels + tokens are never read for another.
  const Config = await currentModel(AppConfig);
  const doc = await Config.findOne({ key: 'singleton' })
    .select('notifiers ntfyUrl ntfyEnabled')
    .lean();
  const arr = Array.isArray(doc?.notifiers) ? doc!.notifiers : [];
  const channels = arr.map(coerce).filter((c): c is NotifierConfig => c !== null);
  if (channels.length === 0 && doc?.ntfyUrl) {
    channels.push({ id: 'ntfy-legacy', type: 'ntfy', enabled: !!doc.ntfyEnabled, url: doc.ntfyUrl, label: 'ntfy' });
  }
  return channels;
}

/**
 * Fan an alert out to every enabled channel. Never throws.
 *
 * Each channel gets its own backed-off retry (P80), all channels in parallel, so a
 * receiver that is restarting costs the caller one backoff, not one per channel. Every
 * attempt (success or final failure) lands in the persisted delivery log, which is what
 * makes a silently-dropped alert visible in Settings → Notifications.
 */
export async function dispatchAlert(title: string, message: string): Promise<{ sent: number; total: number }> {
  const channels = (await getNotifiers()).filter((c) => c.enabled);
  // Web push (P102) is a built-in channel, not a NotifierConfig row: run it alongside the
  // configured channels so someone whose ONLY channel is browser push still gets alerts.
  const [results, webPush] = await Promise.all([
    Promise.allSettled(channels.map((c) => deliverWithRetry(() => attemptOne(c, title, message)))),
    dispatchWebPush(title, message),
  ]);
  const at = new Date().toISOString();
  const rows: [string, { at: string; ok: boolean; status?: number; error?: string; attempts: number }][] = [];
  let sent = webPush.sent;
  results.forEach((r, i) => {
    if (r.status !== 'fulfilled') return; // deliverWithRetry never rejects; defensive only
    const out = r.value;
    if (out.ok) sent++;
    rows.push([
      notifierLogKey(channels[i].id),
      { at, ok: out.ok, ...(out.status ? { status: out.status } : {}), ...(out.ok ? {} : { error: describeOutcome(out) }), attempts: out.attempts },
    ]);
  });
  await recordDeliveries(rows);
  return { sent, total: channels.length + webPush.total };
}
