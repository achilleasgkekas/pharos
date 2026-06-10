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
  try {
    await fetch(url, {
      method: 'POST',
      headers: {
        Title: opts.title,
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
