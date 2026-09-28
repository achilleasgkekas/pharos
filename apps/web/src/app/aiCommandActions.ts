'use server';
import { getAiConfig } from '@/lib/aiConfig';
import { isFeatureEnabled } from '@/lib/aiFeatures.server';
import { anthropicRaw, type AnthropicMessage, type AnthropicBlock } from '@/lib/anthropic';
import { revalidatePath } from 'next/cache';
import { TOOLS, execute, SYSTEM, today } from './aiTools';
import { connectDB } from '@/lib/db';
import { assertCanWrite, getCurrentUser } from '@/lib/auth';
import { Conversation } from '@/models/Conversation';
import { withRequestTenant } from '@/lib/tenancy/request';
import { currentModel } from '@/lib/tenancy/connection';
import { assertAiBudget, recordAiSpend } from '@/lib/aiBudget';
import { recordAiRun } from '@/lib/aiRun';
import { Types } from 'mongoose';

export type AiCommandResult = {
  ok: boolean;
  reply: string;
  actions: { name: string; summary: string }[];
  error?: string;
  conversationId?: string;
};

export type ChatTurn = { role: 'user' | 'assistant'; content: string };

/** Run a multi-turn conversation through Claude + tools. The client keeps the
 *  history (text turns) and sends it whole each call. Needs the Anthropic provider.
 *  The tool registry + executor live in `./aiTools` (shared with the MCP route).
 *
 *  This is the ENTRY POINT that opens the tenant gate for the whole command-bar surface, and it
 *  has to wrap everything, not just the database writes: `getAiConfig` picks up the workspace's
 *  own API key and provider, `isFeatureEnabled` reads its AI switches, the Anthropic call is
 *  metered against its plan, `execute()` acts on its records, and the transcript is stored in its
 *  `conversations`. Ungated in SaaS mode, one workspace's assistant answered with the operator's
 *  key, spent nobody's quota, and wrote to the shared registry database. */
export async function runAiCommand(history: ChatTurn[], conversationId?: string): Promise<AiCommandResult> {
  return withRequestTenant(() => runAiCommandInTenant(history, conversationId));
}

async function runAiCommandInTenant(history: ChatTurn[], conversationId?: string): Promise<AiCommandResult> {
  await assertCanWrite();
  if (!(await isFeatureEnabled('commandBar'))) return { ok: false, reply: '', actions: [], error: 'The AI command bar is turned off in Settings → AI.' };
  const turns = (history || []).filter((t) => t && typeof t.content === 'string' && t.content.trim());
  if (!turns.length) return { ok: false, reply: '', actions: [], error: 'Empty command' };

  const cfg = await getAiConfig();
  if (!cfg.anthropicApiKey) {
    return { ok: false, reply: '', actions: [], error: 'The command bar needs the Anthropic provider. Add an API key in Settings → AI.' };
  }

  const user = await getCurrentUser().catch(() => null);
  const convId = conversationId || new Types.ObjectId().toString();

  const messages: AnthropicMessage[] = turns.map((t) => ({ role: t.role, content: t.content }));
  const actions: { name: string; summary: string }[] = [];
  let reply = '';

  let savedConversationId: string | undefined = conversationId;
  try {
    for (let i = 0; i < 6; i++) {
      try {
        await assertAiBudget();
      } catch (err) {
        void recordAiRun({
          feature: 'commandBar',
          provider: 'anthropic',
          model: cfg.anthropicModel,
          status: 'blocked',
          durationMs: 0,
          error: (err as Error).message,
          trigger: 'user',
          userId: user?.id,
          conversationId: convId,
          turn: i + 1,
        });
        throw err;
      }

      const t0 = Date.now();
      let res;
      try {
        res = await anthropicRaw({
          apiKey: cfg.anthropicApiKey,
          workspaceId: cfg.anthropicWorkspaceId,
          model: cfg.anthropicModel,
          system: `${SYSTEM}\nToday is ${today()}.`,
          tools: TOOLS,
          messages,
          maxTokens: 1024,
        });
      } catch (err) {
        void recordAiRun({
          feature: 'commandBar',
          provider: 'anthropic',
          model: cfg.anthropicModel,
          status: 'error',
          durationMs: Date.now() - t0,
          error: (err as Error).message,
          trigger: 'user',
          userId: user?.id,
          conversationId: convId,
          turn: i + 1,
        });
        throw err;
      }

      // Keep the command bar compatible with provider/test doubles that omit usage metadata;
      // billing telemetry is best-effort and must never turn a valid reply into an error.
      const usage = res.usage ?? { inputTokens: 0, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0 };
      await recordAiSpend(
        cfg.anthropicModel,
        usage.inputTokens,
        usage.outputTokens,
        usage.cacheWriteTokens,
        usage.cacheReadTokens
      );

      void recordAiRun({
        feature: 'commandBar',
        provider: 'anthropic',
        model: cfg.anthropicModel,
        status: 'ok',
        durationMs: Date.now() - t0,
        usage,
        requestId: res.requestId,
        stopReason: res.stopReason,
        trigger: 'user',
        userId: user?.id,
        conversationId: convId,
        turn: i + 1,
      });

      const { content } = res;
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

  // Persist to the conversation history (best-effort — a DB hiccup must not eat the reply).
  try {
    await connectDB();
    const ConversationM = await currentModel(Conversation);
    const stored = [
      ...turns.map((t) => ({ role: t.role, content: t.content })),
      { role: 'assistant' as const, content: reply || 'Done.', actions },
    ];
    const title = turns.find((t) => t.role === 'user')?.content.trim().slice(0, 80) || 'Conversation';
    const userTurns = stored.filter((m) => m.role === 'user').length;
    const update = { $set: { userId: user?.id ?? null, title, messages: stored, turns: userTurns } };
    if (conversationId) {
      await ConversationM.updateOne({ _id: conversationId }, update);
    } else {
      const created = await ConversationM.create({ ...update.$set });
      savedConversationId = created?._id ? String(created._id) : convId;
    }
  } catch {
    savedConversationId = undefined;
    /* history is best-effort */
  }

  return { ok: true, reply: reply || 'Done.', actions, ...(savedConversationId ? { conversationId: savedConversationId } : {}) };
}
