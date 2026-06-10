// Extra AI providers besides Ollama/Anthropic. Two clients cover everything:
//  - openaiCompatJSON: the OpenAI chat/completions schema — works for OpenAI,
//    OpenRouter, Groq, Mistral, DeepSeek, LM Studio… anything "OpenAI-compatible"
//    (just point baseUrl at the right host).
//  - geminiJSON: Google's Generative Language API (different shape).
// Both return the same { json, raw, model } as anthropicJSON/ollama, so the
// dispatch in lib/ollama.ts stays a one-liner per provider.

function mediaTypeOf(b64: string): string {
  if (b64.startsWith('/9j/')) return 'image/jpeg';
  if (b64.startsWith('iVBOR')) return 'image/png';
  if (b64.startsWith('UklGR')) return 'image/webp';
  if (b64.startsWith('R0lGOD')) return 'image/gif';
  return 'image/jpeg';
}

function stripFences(s: string): string {
  return s.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
}

export async function openaiCompatJSON(opts: {
  baseUrl: string; // e.g. https://api.openai.com/v1 · https://openrouter.ai/api/v1 · http://lmstudio:1234/v1
  apiKey: string; // may be blank for local OpenAI-compatible servers (LM Studio)
  model: string;
  system: string;
  user: string;
  imagesBase64?: string[];
}): Promise<{ json: unknown; raw: string; model: string }> {
  const base = opts.baseUrl.replace(/\/$/, '');
  const userContent: unknown = opts.imagesBase64?.length
    ? [
        ...opts.imagesBase64.map((img) => ({
          type: 'image_url',
          image_url: { url: `data:${mediaTypeOf(img)};base64,${img}` },
        })),
        { type: 'text', text: opts.user },
      ]
    : opts.user;

  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(opts.apiKey ? { authorization: `Bearer ${opts.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: opts.model,
      temperature: 0.1,
      messages: [
        { role: 'system', content: opts.system },
        { role: 'user', content: userContent },
      ],
    }),
    signal: AbortSignal.timeout(120000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`AI provider HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[]; model?: string };
  const raw = data.choices?.[0]?.message?.content ?? '';
  if (!raw) throw new Error('AI provider returned an empty response');
  return { json: JSON.parse(stripFences(raw)), raw, model: data.model || opts.model };
}

export async function geminiJSON(opts: {
  apiKey: string;
  model: string; // e.g. gemini-2.0-flash
  system: string;
  user: string;
  imagesBase64?: string[];
}): Promise<{ json: unknown; raw: string; model: string }> {
  const parts: unknown[] = [
    ...(opts.imagesBase64 ?? []).map((img) => ({ inline_data: { mime_type: mediaTypeOf(img), data: img } })),
    { text: opts.user },
  ];
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(opts.model)}:generateContent?key=${encodeURIComponent(opts.apiKey)}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: opts.system }] },
        contents: [{ parts }],
        generationConfig: { temperature: 0.1, responseMimeType: 'application/json' },
      }),
      signal: AbortSignal.timeout(120000),
    }
  );
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Gemini HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const raw = (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('');
  if (!raw) throw new Error('Gemini returned an empty response');
  return { json: JSON.parse(stripFences(raw)), raw, model: opts.model };
}
