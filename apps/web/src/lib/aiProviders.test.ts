import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { openaiCompatJSON, geminiJSON } from './aiProviders';

// aiProviders holds the two "extra" AI clients besides Ollama/Anthropic:
//  - openaiCompatJSON — the OpenAI chat/completions schema (OpenAI, OpenRouter,
//    Groq, Mistral, DeepSeek, LM Studio…). baseUrl points at the host.
//  - geminiJSON — Google's Generative Language API (a different request shape).
// Both build a request body, POST it, then parse a JSON payload out of the model's
// text reply (tolerating ```json fences). The parts worth locking down without a
// live provider: the request body we assemble (auth header, image data-URLs / inline
// data, the OpenAI-vs-Gemini envelope) and the response handling (fence stripping,
// empty-reply + non-2xx both throw). These tests stub global fetch so we can inspect
// the outgoing request and feed canned responses, with zero network I/O.

function mockFetch(impl: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const fn = vi.fn(impl as unknown as typeof fetch);
  vi.stubGlobal('fetch', fn);
  return fn;
}

/** A 1×1 base64 image whose magic-byte prefix marks it as the given format. */
const IMG = {
  jpeg: '/9j/4AAQSkZJRg==',
  png: 'iVBORw0KGgoAAAA=',
  webp: 'UklGRhaaaaaaaa==',
  gif: 'R0lGODlhAQABAA==',
  unknown: 'ZZZZZZZZ==',
};

/** Read the request URL, parsed JSON body and headers off the first fetch call. */
function reqOf(fn: ReturnType<typeof vi.fn>) {
  const url = fn.mock.calls[0][0] as string;
  const init = fn.mock.calls[0][1] as RequestInit;
  return { url, body: JSON.parse(init.body as string), headers: (init.headers ?? {}) as Record<string, string> };
}

const openaiOk = (content: string, model?: string) =>
  new Response(JSON.stringify({ choices: [{ message: { content } }], ...(model ? { model } : {}) }), { status: 200 });

const geminiOk = (parts: { text?: string }[]) =>
  new Response(JSON.stringify({ candidates: [{ content: { parts } }] }), { status: 200 });

beforeEach(() => vi.unstubAllGlobals());
afterEach(() => vi.unstubAllGlobals());

describe('openaiCompatJSON', () => {
  it('POSTs to <baseUrl>/chat/completions and strips a trailing slash', async () => {
    const fn = mockFetch(() => openaiOk('{"ok":true}'));
    await openaiCompatJSON({ baseUrl: 'https://api.openai.com/v1/', apiKey: 'k', model: 'gpt-4o', system: 'sys', user: 'hi' });
    const { url, body } = reqOf(fn);
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect(body.model).toBe('gpt-4o');
    expect(body.temperature).toBe(0.1);
    expect(body.messages[0]).toEqual({ role: 'system', content: 'sys' });
  });

  it('sends a Bearer authorization header when an apiKey is given', async () => {
    const fn = mockFetch(() => openaiOk('{}'));
    await openaiCompatJSON({ baseUrl: 'https://x/v1', apiKey: 'secret', model: 'm', system: 's', user: 'u' });
    expect(reqOf(fn).headers.authorization).toBe('Bearer secret');
  });

  it('omits the authorization header when apiKey is blank (local servers)', async () => {
    const fn = mockFetch(() => openaiOk('{}'));
    await openaiCompatJSON({ baseUrl: 'http://lmstudio:1234/v1', apiKey: '', model: 'm', system: 's', user: 'u' });
    expect(reqOf(fn).headers.authorization).toBeUndefined();
  });

  it('sends the user message as a plain string when there are no images', async () => {
    const fn = mockFetch(() => openaiOk('{}'));
    await openaiCompatJSON({ baseUrl: 'https://x/v1', apiKey: 'k', model: 'm', system: 's', user: 'the question' });
    expect(reqOf(fn).body.messages[1]).toEqual({ role: 'user', content: 'the question' });
  });

  it('builds a multimodal content array with a data-URL image_url + text part', async () => {
    const fn = mockFetch(() => openaiOk('{}'));
    await openaiCompatJSON({ baseUrl: 'https://x/v1', apiKey: 'k', model: 'm', system: 's', user: 'describe', imagesBase64: [IMG.png] });
    const content = reqOf(fn).body.messages[1].content;
    expect(content[0]).toEqual({ type: 'image_url', image_url: { url: `data:image/png;base64,${IMG.png}` } });
    expect(content[content.length - 1]).toEqual({ type: 'text', text: 'describe' });
  });

  it('detects the media type from the base64 magic prefix', async () => {
    const fn = mockFetch(() => openaiOk('{}'));
    await openaiCompatJSON({
      baseUrl: 'https://x/v1', apiKey: 'k', model: 'm', system: 's', user: 'u',
      imagesBase64: [IMG.jpeg, IMG.png, IMG.webp, IMG.gif, IMG.unknown],
    });
    const urls = reqOf(fn).body.messages[1].content
      .filter((p: { type: string }) => p.type === 'image_url')
      .map((p: { image_url: { url: string } }) => p.image_url.url.split(';')[0]);
    expect(urls).toEqual([
      'data:image/jpeg', 'data:image/png', 'data:image/webp', 'data:image/gif',
      'data:image/jpeg', // unknown prefix falls back to jpeg
    ]);
  });

  it('parses JSON from the reply and strips ```json fences', async () => {
    mockFetch(() => openaiOk('```json\n{"store":"Skroutz","total":42}\n```'));
    const r = await openaiCompatJSON({ baseUrl: 'https://x/v1', apiKey: 'k', model: 'm', system: 's', user: 'u' });
    expect(r.json).toEqual({ store: 'Skroutz', total: 42 });
  });

  it('returns the model echoed by the provider, falling back to the requested model', async () => {
    mockFetch(() => openaiOk('{}', 'gpt-4o-2024'));
    const withEcho = await openaiCompatJSON({ baseUrl: 'https://x/v1', apiKey: 'k', model: 'req', system: 's', user: 'u' });
    expect(withEcho.model).toBe('gpt-4o-2024');

    mockFetch(() => openaiOk('{}'));
    const noEcho = await openaiCompatJSON({ baseUrl: 'https://x/v1', apiKey: 'k', model: 'req', system: 's', user: 'u' });
    expect(noEcho.model).toBe('req');
  });

  it('throws with the status and a body snippet on a non-2xx response', async () => {
    mockFetch(() => new Response('rate limited', { status: 429 }));
    await expect(
      openaiCompatJSON({ baseUrl: 'https://x/v1', apiKey: 'k', model: 'm', system: 's', user: 'u' })
    ).rejects.toThrow(/HTTP 429.*rate limited/);
  });

  it('throws when the reply content is empty', async () => {
    mockFetch(() => openaiOk(''));
    await expect(
      openaiCompatJSON({ baseUrl: 'https://x/v1', apiKey: 'k', model: 'm', system: 's', user: 'u' })
    ).rejects.toThrow(/empty response/);
  });
});

describe('geminiJSON', () => {
  it('POSTs to the generateContent endpoint with the model and key URL-encoded', async () => {
    const fn = mockFetch(() => geminiOk([{ text: '{}' }]));
    await geminiJSON({ apiKey: 'a/b key', model: 'gemini-2.0-flash', system: 's', user: 'u' });
    const { url } = reqOf(fn);
    expect(url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=a%2Fb%20key'
    );
  });

  it('puts the system prompt in system_instruction and requests JSON output', async () => {
    const fn = mockFetch(() => geminiOk([{ text: '{}' }]));
    await geminiJSON({ apiKey: 'k', model: 'm', system: 'be terse', user: 'u' });
    const { body } = reqOf(fn);
    expect(body.system_instruction).toEqual({ parts: [{ text: 'be terse' }] });
    expect(body.generationConfig.responseMimeType).toBe('application/json');
    expect(body.generationConfig.temperature).toBe(0.1);
  });

  it('sends images as inline_data parts ahead of the text part', async () => {
    const fn = mockFetch(() => geminiOk([{ text: '{}' }]));
    await geminiJSON({ apiKey: 'k', model: 'm', system: 's', user: 'look', imagesBase64: [IMG.webp] });
    const parts = reqOf(fn).body.contents[0].parts;
    expect(parts[0]).toEqual({ inline_data: { mime_type: 'image/webp', data: IMG.webp } });
    expect(parts[parts.length - 1]).toEqual({ text: 'look' });
  });

  it('joins the candidate parts and strips fences before parsing', async () => {
    mockFetch(() => geminiOk([{ text: '```json\n{"a":' }, { text: '1}\n```' }]));
    const r = await geminiJSON({ apiKey: 'k', model: 'm', system: 's', user: 'u' });
    expect(r.json).toEqual({ a: 1 });
  });

  it('returns the requested model (Gemini does not echo one)', async () => {
    mockFetch(() => geminiOk([{ text: '{}' }]));
    const r = await geminiJSON({ apiKey: 'k', model: 'gemini-pro', system: 's', user: 'u' });
    expect(r.model).toBe('gemini-pro');
  });

  it('throws with the status on a non-2xx response', async () => {
    mockFetch(() => new Response('bad key', { status: 403 }));
    await expect(geminiJSON({ apiKey: 'k', model: 'm', system: 's', user: 'u' })).rejects.toThrow(/Gemini HTTP 403.*bad key/);
  });

  it('throws when no candidate text comes back', async () => {
    mockFetch(() => geminiOk([]));
    await expect(geminiJSON({ apiKey: 'k', model: 'm', system: 's', user: 'u' })).rejects.toThrow(/empty response/);
  });
});
