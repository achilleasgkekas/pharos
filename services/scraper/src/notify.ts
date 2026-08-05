import { config } from './config.js';

/** Send a push via ntfy. No-op if NTFY_TOPIC is unset. */
export async function notify(opts: {
  title: string;
  message: string;
  tags?: string[]; // ntfy emoji shortcodes, e.g. ['chart_with_downwards_trend']
  priority?: 1 | 2 | 3 | 4 | 5;
  click?: string; // URL to open on tap
}): Promise<void> {
  if (!config.ntfyTopic) return;
  const url = `${config.ntfyUrl.replace(/\/$/, '')}/${config.ntfyTopic}`;
  // ntfy requires the Title header to be ASCII (HTTP headers are ByteString — a Greek/emoji/€
  // char throws "Cannot convert argument to a ByteString" from fetch()'s Headers construction,
  // silently swallowed below). Mirrors apps/web/src/lib/notify.ts's sendNtfyTo, whose own
  // comment already documents this constraint — this copy never got the fix. Item titles carry
  // Greek text routinely, so this wasn't a hypothetical: it drops every price-drop/target-hit
  // alert whose title contains anything outside ASCII, which is most of them.
  const asciiTitle = (opts.title || '').replace(/[^\x20-\x7e]/g, '').trim();
  try {
    await fetch(url, {
      method: 'POST',
      headers: {
        ...(asciiTitle ? { Title: asciiTitle } : {}),
        ...(opts.tags?.length ? { Tags: opts.tags.join(',') } : {}),
        ...(opts.priority ? { Priority: String(opts.priority) } : {}),
        ...(opts.click ? { Click: opts.click } : {}),
      },
      body: opts.message,
      signal: AbortSignal.timeout(10000),
    });
  } catch (err) {
    console.error('[notify] failed:', (err as Error).message);
  }
}
