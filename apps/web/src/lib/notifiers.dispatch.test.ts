import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NotifierConfig, NotifierType } from './notifiers.shared';

// notifiers.ts fans an alert out to pluggable HTTP channels (ntfy/discord/slack/telegram/
// webhook). Each channel has a DISTINCT wire contract — Discord wants {content}, Slack {text},
// Telegram {chat_id,text} at the bot-scoped URL, a generic webhook {title,message,ts}. A
// regression that swaps a field name or drops a missing-config guard would silently stop a
// user's notifications. These tests lock every channel's payload shape + the fail-closed
// contract (missing creds / non-ok response / network error → false, never throws) via
// testNotifier(), which drives the same private sendOne() as dispatchAlert without a DB read.
// (notifiers.test.ts covers the client-safe NOTIFIER_TYPES metadata; this is the transport.)

// ntfy delegates to sendNtfyTo (covered by notify.test.ts); mock it so the ntfy branch is
// deterministic and we can assert delegation rather than re-testing the ntfy transport.
const sendNtfyTo = vi.fn(async (..._args: unknown[]) => true);
vi.mock('./notify', () => ({ sendNtfyTo: (...a: unknown[]) => sendNtfyTo(...a) }));

import { testNotifier } from './notifiers';

/** Read the (url, init) of the last fetch call and its parsed JSON body. */
function lastFetch() {
  const [url, init] = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.at(-1) as [
    string,
    RequestInit,
  ];
  return { url, init, body: JSON.parse(String(init.body)) as Record<string, unknown> };
}

const cfg = (over: Partial<NotifierConfig> & { type: NotifierType }): NotifierConfig => ({
  id: 'n1',
  enabled: true,
  label: '',
  ...over,
});

beforeEach(() => {
  sendNtfyTo.mockClear();
  sendNtfyTo.mockResolvedValue(true);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true })),
  );
});

describe('testNotifier — ntfy', () => {
  it('delegates to sendNtfyTo with url, ASCII title, bell tag; returns its result', async () => {
    const ok = await testNotifier(cfg({ type: 'ntfy', url: 'https://ntfy.sh/pharos' }));
    expect(ok).toBe(true);
    expect(sendNtfyTo).toHaveBeenCalledTimes(1);
    const [url, title, message, opts] = sendNtfyTo.mock.calls[0] as unknown as [
      string,
      string,
      string,
      { tags: string[] },
    ];
    expect(url).toBe('https://ntfy.sh/pharos');
    expect(title).toBe('Pharos test');
    expect(message).toMatch(/alerts will arrive/i);
    expect(opts.tags).toEqual(['bell']);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('propagates a false from sendNtfyTo', async () => {
    sendNtfyTo.mockResolvedValueOnce(false);
    expect(await testNotifier(cfg({ type: 'ntfy', url: 'https://ntfy.sh/x' }))).toBe(false);
  });

  it('returns false and never calls sendNtfyTo when url is missing', async () => {
    expect(await testNotifier(cfg({ type: 'ntfy', url: '' }))).toBe(false);
    expect(sendNtfyTo).not.toHaveBeenCalled();
  });
});

describe('testNotifier — discord', () => {
  it('POSTs {content: "**title**\\nmsg"} to the webhook url as JSON', async () => {
    const ok = await testNotifier(cfg({ type: 'discord', url: 'https://discord.com/api/webhooks/1/abc' }));
    expect(ok).toBe(true);
    const { url, init, body } = lastFetch();
    expect(url).toBe('https://discord.com/api/webhooks/1/abc');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect(String(body.content).startsWith('**Pharos test**\n')).toBe(true);
  });

  it('keeps content within the Discord 2000-char limit (<=1900)', async () => {
    await testNotifier(cfg({ type: 'discord', url: 'https://discord.com/x' }));
    const { body } = lastFetch();
    expect(String(body.content).length).toBeLessThanOrEqual(1900);
  });

  it('returns false and does not fetch when url is missing', async () => {
    expect(await testNotifier(cfg({ type: 'discord', url: '' }))).toBe(false);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('returns false on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })));
    expect(await testNotifier(cfg({ type: 'discord', url: 'https://discord.com/x' }))).toBe(false);
  });
});

describe('testNotifier — slack', () => {
  it('POSTs {text: "*title*\\nmsg"} to the webhook url', async () => {
    const ok = await testNotifier(cfg({ type: 'slack', url: 'https://hooks.slack.com/services/T/B/x' }));
    expect(ok).toBe(true);
    const { url, body } = lastFetch();
    expect(url).toBe('https://hooks.slack.com/services/T/B/x');
    expect(String(body.text).startsWith('*Pharos test*\n')).toBe(true);
    expect(body.content).toBeUndefined();
  });

  it('returns false and does not fetch when url is missing', async () => {
    expect(await testNotifier(cfg({ type: 'slack', url: '' }))).toBe(false);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

describe('testNotifier — telegram', () => {
  it('POSTs {chat_id,text} to the bot-scoped sendMessage url', async () => {
    const ok = await testNotifier(cfg({ type: 'telegram', token: 'BOT123', target: '99887' }));
    expect(ok).toBe(true);
    const { url, body } = lastFetch();
    expect(url).toBe('https://api.telegram.org/botBOT123/sendMessage');
    expect(body.chat_id).toBe('99887');
    expect(String(body.text).startsWith('Pharos test\n')).toBe(true);
  });

  it('returns false and does not fetch when token is missing', async () => {
    expect(await testNotifier(cfg({ type: 'telegram', token: '', target: '99887' }))).toBe(false);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('returns false and does not fetch when target is missing', async () => {
    expect(await testNotifier(cfg({ type: 'telegram', token: 'BOT123', target: '' }))).toBe(false);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

describe('testNotifier — webhook', () => {
  it('POSTs {title,message,ts} with an ISO timestamp to the url', async () => {
    const ok = await testNotifier(cfg({ type: 'webhook', url: 'https://example.test/hook' }));
    expect(ok).toBe(true);
    const { url, body } = lastFetch();
    expect(url).toBe('https://example.test/hook');
    expect(body.title).toBe('Pharos test');
    expect(String(body.message)).toMatch(/alerts will arrive/i);
    expect(Number.isNaN(Date.parse(String(body.ts)))).toBe(false);
  });

  it('returns false and does not fetch when url is missing', async () => {
    expect(await testNotifier(cfg({ type: 'webhook', url: '' }))).toBe(false);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

describe('testNotifier — fail-closed contract', () => {
  it('swallows a network error and returns false (never throws)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNREFUSED');
      }),
    );
    await expect(testNotifier(cfg({ type: 'slack', url: 'https://hooks.slack.com/x' }))).resolves.toBe(false);
  });

  it('returns false for an unknown channel type', async () => {
    expect(await testNotifier(cfg({ type: 'carrier-pigeon' as NotifierType }))).toBe(false);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
