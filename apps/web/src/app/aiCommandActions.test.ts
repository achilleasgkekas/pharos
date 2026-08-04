import { describe, it, expect, vi, beforeEach } from 'vitest';

// app/aiCommandActions.ts (93 lines) is the AI command-bar's single export,
// runAiCommand: a multi-turn Claude tool-use loop (client sends the whole chat history
// each call) wired to the shared tool registry in ./aiTools (also used by the MCP
// route). This is the largest/most side-effectful test-less module flagged across the
// last several routine runs — it talks to `@/lib/anthropic` (mocked, no real network
// calls made here), writes to the `Conversation` history collection, and revalidates
// pages when a tool actually changed data.
//
// Behaviour pinned:
//  - Gate order: assertCanWrite() runs FIRST, before the feature-flag check, before
//    reading history, before getAiConfig. A gate rejection short-circuits everything.
//  - Feature flag: isFeatureEnabled('commandBar') is checked BEFORE the history is even
//    filtered — false returns a fixed "turned off in Settings" error without touching
//    getAiConfig or history at all.
//  - History filtering: `(history || []).filter(t => t && typeof t.content ===
//    'string' && t.content.trim())` — drops null/undefined entries, non-string content,
//    and whitespace-only content. An empty result (including `history` itself being
//    undefined) returns {error:'Empty command'} BEFORE getAiConfig is called.
//  - Provider check: getAiConfig() runs only after the above two gates pass; a missing
//    anthropicApiKey returns an error without ever calling anthropicRaw.
//  - The tool loop runs up to 6 iterations. Each iteration: call anthropicRaw, split the
//    response into tool_use blocks and text blocks. Zero tool_use blocks -> the text
//    becomes `reply` and the loop breaks. Otherwise every tool_use is executed via
//    ./aiTools#execute, each result appended to `actions` ({name, summary}), the
//    assistant's raw content pushed back as a message, and a single user message
//    carrying all the tool_results is pushed before the next iteration. If the model
//    keeps calling tools for all 6 iterations without ever answering in plain text,
//    `reply` stays '' the whole time and the final response falls back to 'Done.'.
//  - Errors: the entire loop is wrapped in one try/catch. A thrown error (from
//    anthropicRaw OR from execute) is caught and returned as {ok:false, error}, but
//    `actions` from any PRIOR successful iteration are preserved in the response — only
//    the tool_use whose execute() call threw is missing (its push() line never runs).
//  - revalidatePath fires across 7 fixed paths ('/','/expenses','/income',
//    '/subscriptions','/tasks','/items','/shopping') ONLY when actions.length > 0 —
//    a pure-text answer with no tool calls revalidates nothing.
//  - Conversation persistence is entirely best-effort (its own try/catch, swallowed on
//    failure — a DB hiccup must not eat the reply the user already got). No
//    conversationId -> Conversation.create(...) and the new id is returned; an existing
//    conversationId -> Conversation.updateOne({_id}, {$set:{...}}) and the SAME id is
//    echoed back unchanged. `turns` persisted = count of role==='user' entries across
//    the FULL filtered history (not just the newest message) since the client resends
//    the whole conversation each call. `title` = the first user turn's content, trimmed
//    and capped to 80 chars, defaulting to 'Conversation' if there is none.

const {
  assertCanWriteMock,
  isFeatureEnabledMock,
  getAiConfigMock,
  anthropicRawMock,
  executeMock,
  todayMock,
  connectDBMock,
  getCurrentUserMock,
  conversationCreate,
  conversationUpdateOne,
  revalidatePathMock,
  TOOLS_FIXTURE,
  SYSTEM_FIXTURE,
} = vi.hoisted(() => ({
  assertCanWriteMock: vi.fn(async () => {}),
  isFeatureEnabledMock: vi.fn(async (_key: string) => true),
  getAiConfigMock: vi.fn(async () => ({ anthropicApiKey: 'sk-test-key', anthropicModel: 'claude-sonnet-test' })),
  anthropicRawMock: vi.fn(async (_opts: Record<string, unknown>): Promise<{ content: unknown[]; stopReason: string }> => ({
    content: [{ type: 'text', text: 'Hello!' }],
    stopReason: 'end_turn',
  })),
  executeMock: vi.fn(async (_name: string, _input: Record<string, unknown>) => ({ summary: 'did the thing', content: '{"ok":true}' })),
  todayMock: vi.fn(() => '2026-08-04'),
  connectDBMock: vi.fn(async () => {}),
  getCurrentUserMock: vi.fn(async (): Promise<{ id: string } | null> => ({ id: 'user1' })),
  conversationCreate: vi.fn(async (_doc: Record<string, unknown>) => ({ _id: 'newconv1' })),
  conversationUpdateOne: vi.fn(async (_filter: Record<string, unknown>, _update: Record<string, unknown>) => ({})),
  revalidatePathMock: vi.fn(),
  TOOLS_FIXTURE: [{ name: 'add_task', description: 'adds a task', input_schema: {} }],
  SYSTEM_FIXTURE: 'SYSTEM_PROMPT_FIXTURE',
}));

vi.mock('@/lib/aiConfig', () => ({ getAiConfig: getAiConfigMock }));
vi.mock('@/lib/aiFeatures.server', () => ({ isFeatureEnabled: isFeatureEnabledMock }));
vi.mock('@/lib/anthropic', () => ({ anthropicRaw: anthropicRawMock }));
vi.mock('./aiTools', () => ({
  TOOLS: TOOLS_FIXTURE,
  execute: executeMock,
  SYSTEM: SYSTEM_FIXTURE,
  today: todayMock,
}));
vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/lib/auth', () => ({ assertCanWrite: assertCanWriteMock, getCurrentUser: getCurrentUserMock }));
vi.mock('@/models/Conversation', () => ({
  Conversation: { create: conversationCreate, updateOne: conversationUpdateOne },
}));
vi.mock('next/cache', () => ({ revalidatePath: (...args: unknown[]) => revalidatePathMock(...args) }));

import { runAiCommand } from './aiCommandActions';

const textReply = (text: string) => ({ content: [{ type: 'text', text }], stopReason: 'end_turn' });
const toolUse = (id: string, name: string, input: Record<string, unknown> = {}) => ({
  content: [{ type: 'tool_use', id, name, input }],
  stopReason: 'tool_use',
});

beforeEach(() => {
  vi.clearAllMocks();
  assertCanWriteMock.mockImplementation(async () => {});
  isFeatureEnabledMock.mockImplementation(async () => true);
  getAiConfigMock.mockImplementation(async () => ({ anthropicApiKey: 'sk-test-key', anthropicModel: 'claude-sonnet-test' }));
  anthropicRawMock.mockImplementation(async () => textReply('Hello!'));
  executeMock.mockImplementation(async () => ({ summary: 'did the thing', content: '{"ok":true}' }));
  todayMock.mockImplementation(() => '2026-08-04');
  connectDBMock.mockImplementation(async () => {});
  getCurrentUserMock.mockImplementation(async () => ({ id: 'user1' }));
  conversationCreate.mockImplementation(async () => ({ _id: 'newconv1' }));
  conversationUpdateOne.mockImplementation(async () => ({}));
});

describe('runAiCommand — gating', () => {
  it('checks the write gate before anything else', async () => {
    assertCanWriteMock.mockRejectedValue(new Error('Read-only session'));
    await expect(runAiCommand([{ role: 'user', content: 'hi' }])).rejects.toThrow('Read-only session');
    expect(isFeatureEnabledMock).not.toHaveBeenCalled();
  });

  it('returns a fixed error when the command-bar feature is off, without checking history or the provider', async () => {
    isFeatureEnabledMock.mockResolvedValue(false);
    const r = await runAiCommand([{ role: 'user', content: 'Add a task' }]);
    expect(r).toEqual({ ok: false, reply: '', actions: [], error: 'The AI command bar is turned off in Settings → AI.' });
    expect(getAiConfigMock).not.toHaveBeenCalled();
    expect(anthropicRawMock).not.toHaveBeenCalled();
  });

  it('rejects an empty history array without calling getAiConfig', async () => {
    const r = await runAiCommand([]);
    expect(r).toEqual({ ok: false, reply: '', actions: [], error: 'Empty command' });
    expect(getAiConfigMock).not.toHaveBeenCalled();
  });

  it('rejects history that is only whitespace/malformed turns', async () => {
    const r = await runAiCommand([
      { role: 'user', content: '   ' },
      { role: 'assistant', content: null as unknown as string },
      { role: 'user', content: undefined as unknown as string },
    ]);
    expect(r).toEqual({ ok: false, reply: '', actions: [], error: 'Empty command' });
  });

  it('filters out malformed turns but keeps the valid ones', async () => {
    await runAiCommand([
      { role: 'user', content: '   ' },
      { role: 'user', content: 'Add a task: buy milk' },
    ]);
    const firstCallMessages = anthropicRawMock.mock.calls[0][0].messages;
    expect(firstCallMessages).toEqual([{ role: 'user', content: 'Add a task: buy milk' }]);
  });

  it('errors when the Anthropic key is missing, without calling anthropicRaw', async () => {
    getAiConfigMock.mockResolvedValue({ anthropicApiKey: '', anthropicModel: 'claude-sonnet-test' });
    const r = await runAiCommand([{ role: 'user', content: 'hi' }]);
    expect(r).toEqual({
      ok: false,
      reply: '',
      actions: [],
      error: 'The command bar needs the Anthropic provider. Add an API key in Settings → AI.',
    });
    expect(anthropicRawMock).not.toHaveBeenCalled();
  });
});

describe('runAiCommand — the tool loop', () => {
  it('answers directly with no tool calls (single anthropicRaw round-trip)', async () => {
    anthropicRawMock.mockResolvedValue(textReply('Sure, here you go.'));
    const r = await runAiCommand([{ role: 'user', content: 'What is my net worth?' }]);
    expect(r.ok).toBe(true);
    expect(r.reply).toBe('Sure, here you go.');
    expect(r.actions).toEqual([]);
    expect(anthropicRawMock).toHaveBeenCalledTimes(1);
    expect(executeMock).not.toHaveBeenCalled();
  });

  it('sends the system prompt (with today appended), the tool registry, and maxTokens', async () => {
    await runAiCommand([{ role: 'user', content: 'hi' }]);
    expect(anthropicRawMock).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: 'sk-test-key',
        model: 'claude-sonnet-test',
        system: 'SYSTEM_PROMPT_FIXTURE\nToday is 2026-08-04.',
        tools: TOOLS_FIXTURE,
        maxTokens: 1024,
      })
    );
  });

  it('executes a tool call, threads the tool_result back, and stops once the model answers in text', async () => {
    anthropicRawMock.mockResolvedValueOnce(toolUse('tu1', 'add_task', { title: 'Buy milk' })).mockResolvedValueOnce(textReply('Added it!'));
    executeMock.mockResolvedValueOnce({ summary: 'added task "Buy milk"', content: '{"ok":true,"id":"t1"}' });

    const r = await runAiCommand([{ role: 'user', content: 'Add a task to buy milk' }]);

    expect(executeMock).toHaveBeenCalledWith('add_task', { title: 'Buy milk' });
    expect(r.ok).toBe(true);
    expect(r.reply).toBe('Added it!');
    expect(r.actions).toEqual([{ name: 'add_task', summary: 'added task "Buy milk"' }]);
    expect(anthropicRawMock).toHaveBeenCalledTimes(2);

    const secondCallMessages = (anthropicRawMock.mock.calls[1][0] as Record<string, any>).messages as Record<string, unknown>[];
    // 1 original user turn + 1 assistant turn (the raw tool_use content) + 1 user turn carrying the tool_result.
    expect(secondCallMessages).toHaveLength(3);
    expect(secondCallMessages[1]).toEqual({ role: 'assistant', content: toolUse('tu1', 'add_task', { title: 'Buy milk' }).content });
    expect(secondCallMessages[2]).toEqual({
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: 'tu1', content: '{"ok":true,"id":"t1"}' }],
    });
  });

  it('defaults a missing tool_use input to {} when calling execute', async () => {
    anthropicRawMock
      .mockResolvedValueOnce({ content: [{ type: 'tool_use', id: 'tu1', name: 'get_overview' }], stopReason: 'tool_use' })
      .mockResolvedValueOnce(textReply('Here it is.'));
    await runAiCommand([{ role: 'user', content: 'overview please' }]);
    expect(executeMock).toHaveBeenCalledWith('get_overview', {});
  });

  it('stops after 6 iterations even if the model never stops calling tools, and falls back to "Done."', async () => {
    anthropicRawMock.mockResolvedValue(toolUse('tu', 'add_task', {}));
    const r = await runAiCommand([{ role: 'user', content: 'keep going' }]);
    expect(anthropicRawMock).toHaveBeenCalledTimes(6);
    expect(executeMock).toHaveBeenCalledTimes(6);
    expect(r.ok).toBe(true);
    expect(r.reply).toBe('Done.');
    expect(r.actions).toHaveLength(6);
  });
});

describe('runAiCommand — errors', () => {
  it('returns the error message when anthropicRaw itself throws', async () => {
    anthropicRawMock.mockRejectedValue(new Error('Anthropic returned 529'));
    const r = await runAiCommand([{ role: 'user', content: 'hi' }]);
    expect(r).toEqual({ ok: false, reply: '', actions: [], error: 'Anthropic returned 529' });
  });

  it('returns the error message and preserves actions from EARLIER successful iterations when execute throws mid-loop', async () => {
    anthropicRawMock
      .mockResolvedValueOnce(toolUse('tu1', 'add_task', { title: 'first' }))
      .mockResolvedValueOnce(toolUse('tu2', 'add_task', { title: 'second' }));
    executeMock
      .mockResolvedValueOnce({ summary: 'added first', content: '{}' })
      .mockRejectedValueOnce(new Error('Task validation failed'));

    const r = await runAiCommand([{ role: 'user', content: 'add two tasks' }]);

    expect(r.ok).toBe(false);
    expect(r.error).toBe('Task validation failed');
    expect(r.actions).toEqual([{ name: 'add_task', summary: 'added first' }]);
  });

  it('does not touch the Conversation collection when the loop errors out', async () => {
    anthropicRawMock.mockRejectedValue(new Error('boom'));
    await runAiCommand([{ role: 'user', content: 'hi' }]);
    expect(conversationCreate).not.toHaveBeenCalled();
    expect(conversationUpdateOne).not.toHaveBeenCalled();
  });
});

describe('runAiCommand — revalidation', () => {
  const PATHS = ['/', '/expenses', '/income', '/subscriptions', '/tasks', '/items', '/shopping'];

  it('revalidates all 7 fixed paths when at least one tool ran', async () => {
    anthropicRawMock.mockResolvedValueOnce(toolUse('tu1', 'add_task', {})).mockResolvedValueOnce(textReply('done'));
    await runAiCommand([{ role: 'user', content: 'add a task' }]);
    for (const p of PATHS) expect(revalidatePathMock).toHaveBeenCalledWith(p);
    expect(revalidatePathMock).toHaveBeenCalledTimes(PATHS.length);
  });

  it('revalidates nothing for a pure-text answer with no tool calls', async () => {
    anthropicRawMock.mockResolvedValue(textReply('just chatting'));
    await runAiCommand([{ role: 'user', content: 'hi' }]);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});

describe('runAiCommand — conversation persistence (best-effort)', () => {
  it('creates a NEW conversation when no conversationId is given, and returns the new id', async () => {
    anthropicRawMock.mockResolvedValue(textReply('Sure!'));
    const r = await runAiCommand([{ role: 'user', content: 'Hello there' }]);
    expect(conversationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user1',
        title: 'Hello there',
        turns: 1,
        messages: [
          { role: 'user', content: 'Hello there' },
          { role: 'assistant', content: 'Sure!', actions: [] },
        ],
      })
    );
    expect(conversationUpdateOne).not.toHaveBeenCalled();
    expect(r.conversationId).toBe('newconv1');
  });

  it('updates an EXISTING conversation and echoes the SAME id back', async () => {
    anthropicRawMock.mockResolvedValue(textReply('Sure!'));
    const r = await runAiCommand([{ role: 'user', content: 'Hello again' }], 'existingconv1');
    expect(conversationUpdateOne).toHaveBeenCalledWith(
      { _id: 'existingconv1' },
      { $set: expect.objectContaining({ title: 'Hello again', turns: 1 }) }
    );
    expect(conversationCreate).not.toHaveBeenCalled();
    expect(r.conversationId).toBe('existingconv1');
  });

  it('falls back to userId:null when nobody is signed in', async () => {
    getCurrentUserMock.mockResolvedValue(null);
    anthropicRawMock.mockResolvedValue(textReply('hi'));
    await runAiCommand([{ role: 'user', content: 'hi there' }]);
    expect(conversationCreate).toHaveBeenCalledWith(expect.objectContaining({ userId: null }));
  });

  it('caps the title at 80 characters from the first user turn', async () => {
    const longMsg = 'x'.repeat(200);
    anthropicRawMock.mockResolvedValue(textReply('ok'));
    await runAiCommand([{ role: 'user', content: longMsg }]);
    const doc = conversationCreate.mock.calls[0][0] as Record<string, unknown>;
    expect((doc.title as string).length).toBe(80);
  });

  it('counts ALL user-role turns in the resent history, not just the newest one', async () => {
    anthropicRawMock.mockResolvedValue(textReply('ok'));
    await runAiCommand([
      { role: 'user', content: 'first question' },
      { role: 'assistant', content: 'first answer' },
      { role: 'user', content: 'follow-up question' },
    ]);
    const doc = conversationCreate.mock.calls[0][0] as Record<string, unknown>;
    expect(doc.turns).toBe(2);
  });

  it('is best-effort: a DB failure does not fail the command, and no conversationId is returned', async () => {
    anthropicRawMock.mockResolvedValue(textReply('Still works!'));
    connectDBMock.mockRejectedValue(new Error('Mongo is down'));
    const r = await runAiCommand([{ role: 'user', content: 'hi' }]);
    expect(r).toEqual({ ok: true, reply: 'Still works!', actions: [], conversationId: undefined });
  });
});
