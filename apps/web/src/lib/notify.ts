import { getAppSettings } from './appSettings';

type NtfyOpts = { priority?: number; tags?: string[] };

/** POST a notification to an explicit ntfy topic URL. Title is ASCII-only (ntfy
 *  header constraint) — keep Greek text in the body. Returns success. */
export async function sendNtfyTo(url: string, title: string, message: string, opts?: NtfyOpts): Promise<boolean> {
  if (!url) return false;
  try {
    const headers: Record<string, string> = {};
    // ntfy requires the Title header to be ASCII; strip anything else.
    const asciiTitle = (title || '').replace(/[^\x20-\x7e]/g, '').trim();
    if (asciiTitle) headers.Title = asciiTitle;
    if (opts?.priority) headers.Priority = String(opts.priority);
    if (opts?.tags?.length) headers.Tags = opts.tags.join(',');
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: message,
      signal: AbortSignal.timeout(10000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Send via the configured ntfy topic. No-op (returns false) if disabled/unset. */
export async function sendNtfy(title: string, message: string, opts?: NtfyOpts): Promise<boolean> {
  const s = await getAppSettings();
  if (!s.ntfyEnabled || !s.ntfyUrl) return false;
  return sendNtfyTo(s.ntfyUrl, title, message, opts);
}
