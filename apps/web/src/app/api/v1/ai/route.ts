import { NextRequest, NextResponse } from 'next/server';
import { withAuth, apiError } from '@/lib/apiAuth';
import { readBody } from '@/lib/apiBody';
import { runAiCommand, type ChatTurn } from '@/app/aiCommandActions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Keep only the most recent turns; each turn becomes an Anthropic API call's
 *  input, so an unbounded history is a direct cost/DoS lever. */
const MAX_TURNS = 20;
/** Hard cap per message so a single huge blob can't inflate token usage. */
const MAX_CONTENT = 8000;

/** POST /api/v1/ai  { messages: [{ role: 'user'|'assistant', content }] }
 *  Runs the same natural-language command agent as the web AI bar (add expenses,
 *  items, tasks, search, overview…). → { reply, actions: [{ name, summary }] }
 *  Needs the Anthropic provider + the 'commandBar' AI feature enabled. */
export async function POST(req: NextRequest) {
  return withAuth(req, async () => {
    const b = await readBody(req);
    const raw = Array.isArray(b.messages) ? b.messages.slice(-MAX_TURNS) : [];
    const messages: ChatTurn[] = [];
    for (const m of raw) {
      if (m && typeof m === 'object' && typeof (m as { content?: unknown }).content === 'string') {
        const role = (m as { role?: unknown }).role === 'assistant' ? 'assistant' : 'user';
        messages.push({ role, content: (m as { content: string }).content.slice(0, MAX_CONTENT) });
      }
    }
    if (!messages.length) return apiError('messages required (array of { role, content })');
    const r = await runAiCommand(messages);
    if (!r.ok) return apiError(r.error || 'AI failed', 400);
    return NextResponse.json({ reply: r.reply, actions: r.actions });
  });
}
