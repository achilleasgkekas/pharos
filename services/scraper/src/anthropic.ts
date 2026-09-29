// Minimal Anthropic text→JSON call for the scraper (no SDK; mirrors the web app's
// lib/anthropic.ts shape). Used only when the scraper provider is set to Anthropic.

function stripFences(s: string): string {
  return s.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
}

export async function anthropicPriceJSON(opts: {
  apiKey: string;
  model: string;
  system: string;
  user: string;
}): Promise<{
  raw: string;
  json: unknown;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheWriteTokens: number;
    cacheReadTokens: number;
  };
  requestId?: string;
  stopReason?: string;
}> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': opts.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: opts.model,
      max_tokens: 512,
      system: `${opts.system}\nReturn ONLY raw JSON, no markdown.`,
      messages: [{ role: 'user', content: opts.user }],
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Anthropic HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  const requestId = res.headers.get('request-id') ?? res.headers.get('x-request-id') ?? undefined;
  const data = (await res.json()) as {
    content?: { type: string; text?: string }[];
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };
    stop_reason?: string;
  };
  const text = (data.content ?? [])
    .filter((c) => c.type === 'text')
    .map((c) => c.text ?? '')
    .join('')
    .trim();
  return {
    raw: text,
    json: JSON.parse(stripFences(text)),
    usage: {
      inputTokens: data.usage?.input_tokens ?? 0,
      outputTokens: data.usage?.output_tokens ?? 0,
      cacheWriteTokens: data.usage?.cache_creation_input_tokens ?? 0,
      cacheReadTokens: data.usage?.cache_read_input_tokens ?? 0,
    },
    requestId,
    stopReason: data.stop_reason ?? undefined,
  };
}
