'use server';
import { getAiConfig } from '@/lib/aiConfig';
import { isFeatureEnabled } from '@/lib/aiFeatures.server';
import { anthropicRaw, type AnthropicMessage, type AnthropicBlock } from '@/lib/anthropic';
import { revalidatePath } from 'next/cache';
import { TOOLS, execute, SYSTEM, today } from './aiTools';

export type AiCommandResult = {
  ok: boolean;
  reply: string;
  actions: { name: string; summary: string }[];
  error?: string;
};

export type ChatTurn = { role: 'user' | 'assistant'; content: string };

/** Run a multi-turn conversation through Claude + tools. The client keeps the
 *  history (text turns) and sends it whole each call. Needs the Anthropic provider.
 *  The tool registry + executor live in `./aiTools` (shared with the MCP route). */
export async function runAiCommand(history: ChatTurn[]): Promise<AiCommandResult> {
  if (!(await isFeatureEnabled('commandBar'))) return { ok: false, reply: '', actions: [], error: 'The AI command bar is turned off in Settings → AI.' };
  const turns = (history || []).filter((t) => t && typeof t.content === 'string' && t.content.trim());
  if (!turns.length) return { ok: false, reply: '', actions: [], error: 'Empty command' };

  const cfg = await getAiConfig();
  if (!cfg.anthropicApiKey) {
    return { ok: false, reply: '', actions: [], error: 'The command bar needs the Anthropic provider. Add an API key in Settings → AI.' };
  }

  const messages: AnthropicMessage[] = turns.map((t) => ({ role: t.role, content: t.content }));
  const actions: { name: string; summary: string }[] = [];
  let reply = '';

  try {
    for (let i = 0; i < 6; i++) {
      const { content } = await anthropicRaw({ apiKey: cfg.anthropicApiKey, model: cfg.anthropicModel, system: `${SYSTEM}\nToday is ${today()}.`, tools: TOOLS, messages, maxTokens: 1024 });
      const toolUses = content.filter((b): b is Extract<AnthropicBlock, { type: 'tool_use' }> => b.type === 'tool_use');
      const textOut = content
        .filter((b): b is Extract<AnthropicBlock, { type: 'text' }> => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
        .trim();

      if (toolUses.length === 0) {
        reply = textOut;
        break;
      }
      messages.push({ role: 'assistant', content });
      const results: unknown[] = [];
      for (const tu of toolUses) {
        const r = await execute(tu.name, tu.input || {});
        actions.push({ name: tu.name, summary: r.summary });
        results.push({ type: 'tool_result', tool_use_id: tu.id, content: r.content });
      }
      messages.push({ role: 'user', content: results });
    }
  } catch (err) {
    return { ok: false, reply: '', actions, error: (err as Error).message };
  }

  // Anything that created data → refresh the affected pages.
  if (actions.length) {
    for (const p of ['/', '/expenses', '/income', '/subscriptions', '/tasks', '/items', '/shopping']) revalidatePath(p);
  }
  return { ok: true, reply: reply || 'Done.', actions };
}
