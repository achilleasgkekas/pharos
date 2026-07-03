import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sendNtfyTo } from './notify';

// `sendNtfyTo` is the low-level ntfy sender used by every alert (price drops,
// installments due, warranties expiring). It POSTs the message body to a topic
// URL and assembles the ntfy headers. The important invariant is the Title
// header: ntfy rejects non-ASCII header values, so a Greek title would silently
// break the notification. The code strips the Title to ASCII and keeps Greek
// text in the body instead. It is also fail-closed: an empty URL or any network
// error returns false rather than throwing. These tests mock global fetch so we
// can assert both the headers we send and the return value, with no real I/O.
//
// The module imports getAppSettings at the top (which pulls in the DB layer),
// but that is import-time only and never runs here — sendNtfyTo takes an explicit
// URL and does not touch settings, so no mock is needed.

function mockFetch(impl: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const fn = vi.fn(impl as unknown as typeof fetch);
  vi.stubGlobal('fetch', fn);
  return fn;
}

/** Read the Title/Priority/Tags headers off the RequestInit passed to fetch. */
function headersOf(fn: ReturnType<typeof vi.fn>): Record<string, string> {
  const init = fn.mock.calls[0][1] as RequestInit;
  return (init.headers ?? {}) as Record<string, string>;
}

const ok = () => new Response('', { status: 200 });

describe('sendNtfyTo', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns false and does not call fetch when the URL is empty', async () => {
    const fn = mockFetch(() => ok());
    const result = await sendNtfyTo('', 'Alert', 'body');
    expect(result).toBe(false);
    expect(fn).not.toHaveBeenCalled();
  });

  it('POSTs the message as the body and returns true on a 2xx response', async () => {
    const fn = mockFetch(() => ok());
    const result = await sendNtfyTo('https://ntfy.sh/topic', 'Alert', 'hello world');
    expect(result).toBe(true);
    expect(fn).toHaveBeenCalledTimes(1);
    const url = fn.mock.calls[0][0];
    const init = fn.mock.calls[0][1] as RequestInit;
    expect(url).toBe('https://ntfy.sh/topic');
    expect(init.method).toBe('POST');
    expect(init.body).toBe('hello world');
  });

  it('returns false when the response is not ok (e.g. 4xx/5xx)', async () => {
    mockFetch(() => new Response('nope', { status: 500 }));
    expect(await sendNtfyTo('https://ntfy.sh/topic', 'Alert', 'body')).toBe(false);
  });

  it('sends a plain ASCII title verbatim in the Title header', async () => {
    const fn = mockFetch(() => ok());
    await sendNtfyTo('https://ntfy.sh/topic', 'Price drop', 'body');
    expect(headersOf(fn).Title).toBe('Price drop');
  });

  it('strips non-ASCII characters from the Title (Greek stays in the body)', async () => {
    const fn = mockFetch(() => ok());
    await sendNtfyTo('https://ntfy.sh/topic', 'Ειδοποίηση', 'Το σύνολο είναι 12€');
    const headers = headersOf(fn);
    // A fully non-ASCII title becomes empty after stripping → header omitted.
    expect(headers.Title).toBeUndefined();
    // The body is sent unchanged, Greek and all.
    expect((fn.mock.calls[0][1] as RequestInit).body).toBe('Το σύνολο είναι 12€');
  });

  it('keeps the ASCII part of a mixed-script title and drops the rest', async () => {
    const fn = mockFetch(() => ok());
    await sendNtfyTo('https://ntfy.sh/topic', 'Alert Ειδοποίηση now', 'body');
    // Non-ASCII run removed; surrounding ASCII (including the space it left) trimmed at the ends.
    expect(headersOf(fn).Title).toBe('Alert  now');
  });

  it('trims surrounding whitespace from the Title', async () => {
    const fn = mockFetch(() => ok());
    await sendNtfyTo('https://ntfy.sh/topic', '   Alert   ', 'body');
    expect(headersOf(fn).Title).toBe('Alert');
  });

  it('omits the Title header when the title is empty', async () => {
    const fn = mockFetch(() => ok());
    await sendNtfyTo('https://ntfy.sh/topic', '', 'body');
    expect(headersOf(fn).Title).toBeUndefined();
  });

  it('sets the Priority header as a string when provided', async () => {
    const fn = mockFetch(() => ok());
    await sendNtfyTo('https://ntfy.sh/topic', 'Alert', 'body', { priority: 5 });
    expect(headersOf(fn).Priority).toBe('5');
  });

  it('omits the Priority header when priority is falsy (0/undefined)', async () => {
    const fn = mockFetch(() => ok());
    await sendNtfyTo('https://ntfy.sh/topic', 'Alert', 'body', { priority: 0 });
    expect(headersOf(fn).Priority).toBeUndefined();
  });

  it('joins tags with commas in the Tags header', async () => {
    const fn = mockFetch(() => ok());
    await sendNtfyTo('https://ntfy.sh/topic', 'Alert', 'body', { tags: ['warning', 'money'] });
    expect(headersOf(fn).Tags).toBe('warning,money');
  });

  it('omits the Tags header when tags is empty', async () => {
    const fn = mockFetch(() => ok());
    await sendNtfyTo('https://ntfy.sh/topic', 'Alert', 'body', { tags: [] });
    expect(headersOf(fn).Tags).toBeUndefined();
  });

  it('returns false (never throws) when fetch rejects', async () => {
    mockFetch(() => {
      throw new Error('network down');
    });
    await expect(sendNtfyTo('https://ntfy.sh/topic', 'Alert', 'body')).resolves.toBe(false);
  });
});
