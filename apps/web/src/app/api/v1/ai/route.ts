import { NextRequest, NextResponse } from 'next/server';
import { withAuth, apiError } from '@/lib/apiAuth';
import { runAiCommand, type ChatTurn } from '@/app/aiCommandActions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/v1/ai  { messages: [{ role: 'user'|'assistant', content }] }
 *  Runs the same natural-language command agent as the web AI bar (add expenses,
 *  items, tasks, search, overview…). → { reply, actions: [{ name, summary }] }
 *  Needs the Anthropic provider + the 'commandBar' AI feature enabled. */
export async function POST(req: NextRequest) {
  return withAuth(req, async () => {
    const b = (await req.json().catch(() => ({}))) as { messages?: unknown };
    const raw = Array.isArray(b.messages) ? b.messages : [];
    const messages: ChatTurn[] = [];
    for (const m of raw) {
      if (m && typeof m === 'object' && typeof (m as { content?: unknown }).content === 'string') {
        const role = (m as { role?: unknown }).role === 'assistant' ? 'assistant' : 'user';
        messages.push({ role, content: (m as { content: string }).content });
      }
    }
    if (!messages.length) return apiError('messages required (array of { role, content })');
    const r = await runAiCommand(messages);
    if (!r.ok) return apiError(r.error || 'AI failed', 400);
    return NextResponse.json({ reply: r.reply, actions: r.actions });
  });
}
