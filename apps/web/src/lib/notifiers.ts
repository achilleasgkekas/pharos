import { connectDB } from './db';
import { AppConfig } from '@/models/AppConfig';
import { currentModel } from './tenancy/connection';
import { sendNtfyTo } from './notify';
import { assertPublicUrl } from './ssrf';
import { NOTIFIER_TYPES, type NotifierConfig, type NotifierType } from './notifiers.shared';
import { deliverWithRetry, describeOutcome, type DeliveryOutcome } from './deliveryRetry';
import { recordDeliveries } from './deliveryLog';
import { notifierLogKey } from './deliveryLog.shared';

export { NOTIFIER_TYPES };
export type { NotifierConfig, NotifierType };

/**
 * Pluggable outbound notifier. Alerts (deals, installments due, expiring
 * warranties) fan out to every enabled channel. All channels are plain HTTP
 * POSTs, so no extra dependency is needed — email is reachable via a generic
 * webhook (Zapier/Make/n8n) or a self-hosted relay.
 *
 * Channels live as an array on AppConfig.notifiers. ntfy is just one channel
 * type; the legacy ntfyUrl/ntfyEnabled fields are migrated in on read so older
 * setups keep working until the user saves from Settings.
 */

const TIMEOUT = 10000;

const MISSING_CONFIG: DeliveryOutcome = { ok: false, error: 'Missing configuration', permanent: true };

/** POST JSON and turn the response (or the failure) into a DeliveryOutcome. A rejected
 *  SSRF check is `permanent` — retrying a private/internal target can never succeed. */
async function postJson(url: string, payload: unknown, guard: boolean): Promise<DeliveryOutcome> {
  if (guard) {
    try {
      await assertPublicUrl(url); // user-supplied webhook URL — refuse private/internal targets
    } catch (err) {
      return { ok: false, error: (err as Error).message, permanent: true };
    }
  }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TIMEOUT),
    });
    return res.ok ? { ok: true, ...(res.status ? { status: res.status } : {}) } : { ok: false, status: res.status, error: 'Rejected by receiver' };
  } catch (err) {
    return { ok: false, error: (err as Error)?.message || 'Network error' };
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
      return c.url ? postJson(c.url, { content: `**${title}**\n${message}`.slice(0, 1900) }, true) : MISSING_CONFIG;
    case 'slack':
      return c.url ? postJson(c.url, { text: `*${title}*\n${message}` }, true) : MISSING_CONFIG;
    case 'telegram':
      // Host is the hardcoded api.telegram.org, not user-supplied → no SSRF guard needed.
      return c.token && c.target
        ? postJson(`https://api.telegram.org/bot${c.token}/sendMessage`, { chat_id: c.target, text: `${title}\n${message}` }, false)
        : MISSING_CONFIG;
    case 'webhook':
      return c.url ? postJson(c.url, { title, message, ts: new Date().toISOString() }, true) : MISSING_CONFIG;
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
  if (channels.length === 0) return { sent: 0, total: 0 };
  const results = await Promise.allSettled(
    channels.map((c) => deliverWithRetry(() => attemptOne(c, title, message))),
  );
  const at = new Date().toISOString();
  const rows: [string, { at: string; ok: boolean; status?: number; error?: string; attempts: number }][] = [];
  let sent = 0;
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
  return { sent, total: channels.length };
}
