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
}): Promise<unknown> {
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
  const data = (await res.json()) as { content?: { type: string; text?: string }[] };
  const text = (data.content ?? [])
    .filter((c) => c.type === 'text')
    .map((c) => c.text ?? '')
    .join('')
    .trim();
  return JSON.parse(stripFences(text));
}
