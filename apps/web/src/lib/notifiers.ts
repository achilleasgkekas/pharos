import { connectDB } from './db';
import { AppConfig } from '@/models/AppConfig';
import { sendNtfyTo } from './notify';
import { NOTIFIER_TYPES, type NotifierConfig, type NotifierType } from './notifiers.shared';

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

/** Title is ASCII-only for ntfy; the body keeps any unicode (e.g. Greek). */
async function sendOne(c: NotifierConfig, title: string, message: string): Promise<boolean> {
  try {
    switch (c.type) {
      case 'ntfy':
        return c.url ? sendNtfyTo(c.url, title, message, { tags: ['bell'] }) : false;
      case 'discord': {
        if (!c.url) return false;
        const res = await fetch(c.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: `**${title}**\n${message}`.slice(0, 1900) }),
          signal: AbortSignal.timeout(TIMEOUT),
        });
        return res.ok;
      }
      case 'slack': {
        if (!c.url) return false;
        const res = await fetch(c.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: `*${title}*\n${message}` }),
          signal: AbortSignal.timeout(TIMEOUT),
        });
        return res.ok;
      }
      case 'telegram': {
        if (!c.token || !c.target) return false;
        const res = await fetch(`https://api.telegram.org/bot${c.token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: c.target, text: `${title}\n${message}` }),
          signal: AbortSignal.timeout(TIMEOUT),
        });
        return res.ok;
      }
      case 'webhook': {
        if (!c.url) return false;
        const res = await fetch(c.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, message, ts: new Date().toISOString() }),
          signal: AbortSignal.timeout(TIMEOUT),
        });
        return res.ok;
      }
      default:
        return false;
    }
  } catch {
    return false;
  }
}

/** Send a one-off test to a single (possibly unsaved) channel config. */
export async function testNotifier(c: NotifierConfig): Promise<boolean> {
  return sendOne(c, 'Pharos test', 'Notifications are working — alerts will arrive here.');
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
  const doc = await AppConfig.findOne({ key: 'singleton' })
    .select('notifiers ntfyUrl ntfyEnabled')
    .lean();
  const arr = Array.isArray(doc?.notifiers) ? doc!.notifiers : [];
  const channels = arr.map(coerce).filter((c): c is NotifierConfig => c !== null);
  if (channels.length === 0 && doc?.ntfyUrl) {
    channels.push({ id: 'ntfy-legacy', type: 'ntfy', enabled: !!doc.ntfyEnabled, url: doc.ntfyUrl, label: 'ntfy' });
  }
  return channels;
}

/** Fan an alert out to every enabled channel. Never throws. */
export async function dispatchAlert(title: string, message: string): Promise<{ sent: number; total: number }> {
  const channels = (await getNotifiers()).filter((c) => c.enabled);
  if (channels.length === 0) return { sent: 0, total: 0 };
  const results = await Promise.allSettled(channels.map((c) => sendOne(c, title, message)));
  const sent = results.filter((r) => r.status === 'fulfilled' && r.value).length;
  return { sent, total: channels.length };
}
