// Minimal Anthropic (Claude) client over fetch — no SDK dependency. Used for the
// heavy parses (statements, specs, receipts) when the user enables it in /settings.

type ImageMedia = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';

/** Sniff the media type from the first bytes of a base64 payload. Exported for tests. */
export function mediaTypeOf(b64: string): ImageMedia {
  if (b64.startsWith('/9j/')) return 'image/jpeg';
  if (b64.startsWith('iVBOR')) return 'image/png';
  if (b64.startsWith('UklGR')) return 'image/webp';
  if (b64.startsWith('R0lGOD')) return 'image/gif';
  return 'image/jpeg';
}

/** Strip markdown code fences from a model's JSON reply. Exported for tests. */
export function stripFences(raw: string): string {
  return raw.replace(/```json\s*|```\s*$/gi, '').replace(/```\s*$/g, '').trim();
}

/** Scrub the API key (and any sk-ant-… token) out of an error string before it
 *  bubbles up to a UI message or log. Defense in depth: the API doesn't echo the
 *  key, but error bodies/strings shouldn't be able to carry it either. Exported for tests. */
export function redactKey(s: string, apiKey: string): string {
  let out = s;
  if (apiKey && apiKey.length > 8) out = out.split(apiKey).join('[redacted]');
  return out.replace(/sk-ant-[A-Za-z0-9_-]+/g, '[redacted]');
}

/** Standard request headers, plus `anthropic-workspace-id` when the key is identity-linked and
 *  the user supplied a workspace id. Without that header such keys fail with HTTP 400
 *  ("anthropic-workspace-id is required when authenticating with an identity-linked API key"). */
function anthropicHeaders(apiKey: string, workspaceId?: string): Record<string, string> {
  const h: Record<string, string> = {
    'content-type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
  };
  const ws = workspaceId?.trim();
  if (ws) h['anthropic-workspace-id'] = ws;
  return h;
}

/** Newer Anthropic models (Sonnet 5, Opus 5, Opus 4.7/4.8, Fable/Mythos 5.x) REJECT sampling
 *  params: a request carrying `temperature` returns HTTP 400. The older families (Sonnet
 *  4.5/4.6, Opus 4.6, Haiku 4.5, Claude 3.x) still accept it. Omitting `temperature` is valid
 *  on EVERY model, so we send it only where it is allowed (a mild determinism nudge for JSON
 *  extraction) and drop it wherever it would 400. Exported for tests. */
export function acceptsTemperature(model: string): boolean {
  return !/(sonnet-5|opus-5|opus-4-[78]|fable-5|mythos-5)/i.test(model);
}

type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: ImageMedia; data: string } };

/**
 * Single-shot Claude call that returns parsed JSON. Throws with a clear message
 * on transport / auth / JSON errors so callers can surface it.
 */
export async function anthropicJSON(opts: {
  apiKey: string;
  workspaceId?: string;
  model: string;
  system: string;
  user: string;
  imagesBase64?: string[];
}): Promise<{ json: unknown; raw: string; model: string }> {
  const content: ContentBlock[] = [];
  for (const img of opts.imagesBase64 ?? []) {
    content.push({ type: 'image', source: { type: 'base64', media_type: mediaTypeOf(img), data: img } });
  }
  content.push({ type: 'text', text: opts.user });

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: anthropicHeaders(opts.apiKey, opts.workspaceId),
    body: JSON.stringify({
      model: opts.model,
      max_tokens: 4096,
      // Sampling params 400 on the newest models — send temperature only where accepted.
      ...(acceptsTemperature(opts.model) ? { temperature: 0.1 } : {}),
      system: `${opts.system}\n\nReturn ONLY valid minified JSON. No markdown fences, no prose.`,
      messages: [{ role: 'user', content }],
    }),
    signal: AbortSignal.timeout(90000),
  });

  if (!res.ok) {
    let detail = '';
    try {
      const e = await res.json();
      detail = e?.error?.message || JSON.stringify(e).slice(0, 200);
    } catch {
      detail = (await res.text()).slice(0, 200);
    }
    throw new Error(`Anthropic ${res.status}: ${redactKey(detail, opts.apiKey)}`);
  }

  const data = (await res.json()) as { content?: { type: string; text?: string }[] };
  const raw = (data.content?.find((b) => b.type === 'text')?.text ?? '').trim();
  if (!raw) throw new Error('Anthropic returned an empty response');
  return { json: JSON.parse(stripFences(raw)), raw, model: opts.model };
}

// ─── Tool-use (for the homepage AI command bar) ─────────────────────────────

export type AnthropicTool = { name: string; description: string; input_schema: Record<string, unknown> };
export type AnthropicBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: string; [k: string]: unknown };
export type AnthropicMessage = { role: 'user' | 'assistant'; content: string | unknown[] };

/** Low-level Claude call with tool support. The caller runs the tool loop. */
export async function anthropicRaw(opts: {
  apiKey: string;
  workspaceId?: string;
  model: string;
  system: string;
  tools?: AnthropicTool[];
  messages: AnthropicMessage[];
  maxTokens?: number;
}): Promise<{ content: AnthropicBlock[]; stopReason: string }> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: anthropicHeaders(opts.apiKey, opts.workspaceId),
    body: JSON.stringify({
      model: opts.model,
      max_tokens: opts.maxTokens ?? 1024,
      system: opts.system,
      ...(opts.tools && opts.tools.length ? { tools: opts.tools } : {}),
      messages: opts.messages,
    }),
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) {
    let detail = '';
    try {
      detail = (await res.json())?.error?.message ?? '';
    } catch {
      detail = (await res.text()).slice(0, 200);
    }
    throw new Error(`Anthropic ${res.status}: ${redactKey(detail, opts.apiKey)}`);
  }
  const data = (await res.json()) as { content?: AnthropicBlock[]; stop_reason?: string };
  return { content: data.content ?? [], stopReason: data.stop_reason ?? 'end_turn' };
}

/** Lightweight credential check used by the settings "Test" button. */
export async function anthropicTest(
  apiKey: string,
  model: string,
  workspaceId?: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: anthropicHeaders(apiKey, workspaceId),
      body: JSON.stringify({
        model,
        max_tokens: 8,
        messages: [{ role: 'user', content: 'ping' }],
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (res.ok) return { ok: true };
    let detail = '';
    try {
      detail = (await res.json())?.error?.message ?? '';
    } catch {
      /* ignore */
    }
    return { ok: false, error: `HTTP ${res.status}${detail ? ` · ${detail}` : ''}` };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
