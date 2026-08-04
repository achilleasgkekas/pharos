import { getAppSettings } from './appSettings';
import { assertPublicUrl } from './ssrf';

type NtfyOpts = { priority?: number; tags?: string[] };

/** POST a notification to an explicit ntfy topic URL. Title is ASCII-only (ntfy
 *  header constraint) — keep Greek text in the body. Returns success. */
export async function sendNtfyTo(url: string, title: string, message: string, opts?: NtfyOpts): Promise<boolean> {
  if (!url) return false;
  try {
    // SSRF guard: the topic URL is user-supplied (Settings), so refuse anything
    // that resolves to a private/loopback/internal address before POSTing.
    await assertPublicUrl(url);
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

/**
 * Fire the one-off "Send test notification" push, with NO authorisation of its own.
 *
 * It lives here rather than only inside the `sendTestNtfy` server action because the action
 * gates on `requireAdmin()`, which reads the **session cookie** — and API clients reach
 * this feature over `POST /api/v1/settings/test-notify` with a Bearer token and no cookie at
 * all. A session-only guard on a path that has no session does not deny the caller, it
 * *breaks* the endpoint. So each caller applies the guard its own transport can actually
 * evaluate (cookie session for the web action, `canAdmin(user.role)` for the API route) and
 * both then run this shared body.
 */
export async function runNtfyTest(): Promise<{ ok: boolean; error?: string }> {
  const s = await getAppSettings();
  if (!s.ntfyUrl) return { ok: false, error: 'Set an ntfy URL first' };
  const ok = await sendNtfyTo(s.ntfyUrl, 'Pharos test', 'Notifications are working — alerts will arrive here.', {
    tags: ['white_check_mark'],
  });
  return ok ? { ok: true } : { ok: false, error: 'ntfy POST failed — check the URL' };
}
