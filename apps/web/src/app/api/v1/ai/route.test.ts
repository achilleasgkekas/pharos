import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// POST /api/v1/ai is the endpoint the Expo mobile app (and the web AI command bar) hits to run a
// multi-turn natural-language command against the same tool-use agent (add expenses/items/tasks,
// search, overview…). The agent loop itself lives in runAiCommand (aiCommandActions.ts) — the route
// is a thin envelope, but three route-only behaviours live NOWHERE else and a drift here silently
// breaks mobile chat:
//   - the Bearer-auth gate (withAuth → 401 without a valid token, BEFORE any body read),
//   - history sanitation: `messages` must be an array; `.slice(-MAX_TURNS)` keeps only the most
//     recent 20 raw entries (a cost/DoS lever — unbounded history = unbounded Anthropic input),
//     THEN each entry is filtered/coerced — only { role, content: string } objects survive, role
//     defaults to 'user' unless exactly 'assistant', content is hard-capped to MAX_CONTENT (8000)
//     chars. If nothing survives → 400 'messages required…' WITHOUT calling runAiCommand,
//   - the envelope: ok → 200 { reply, actions } (conversationId is NOT echoed back even though
//     runAiCommand can return one); not-ok → apiError(r.error || 'AI failed', 400).
// We exercise the REAL apiAuth/apiBody helpers (withAuth + readBody) and only mock the DB seam
// (@/lib/db + @/models/User for the auth lookup) and the agent itself (runAiCommand).

type ChatTurn = { role: 'user' | 'assistant'; content: string };
type AiResult =
  | { ok: true; reply: string; actions: { name: string; summary: string }[]; conversationId?: string }
  | { ok: false; reply: string; actions: { name: string; summary: string }[]; error: string };

const { connectDBMock, userFindOne, userState, runAiCommand } = vi.hoisted(() => {
  const userState: { doc: unknown } = {
    doc: { _id: 'u1', name: 'Achilleas', username: 'ach', role: 'admin' },
  };
  const userFindOne = vi.fn(() => ({ select: () => ({ lean: async () => userState.doc }) }));
  const runAiCommand = vi.fn<(history: ChatTurn[], conversationId?: string) => Promise<AiResult>>(async () => ({
    ok: true,
    reply: 'Done.',
    actions: [],
  }));
  return { connectDBMock: vi.fn(async () => {}), userFindOne, userState, runAiCommand };
});

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/User', () => ({ User: { findOne: userFindOne } }));
vi.mock('@/app/aiCommandActions', () => ({ runAiCommand }));

// withAuth now resolves models through currentModel(). SAAS_MODE is off in tests, so the real
// helper would hand back the same model anyway; this keeps the DB seam mocked without a connection.
vi.mock('@/lib/tenancy/connection', () => ({ currentModel: async (m: unknown) => m }));

import { POST } from './route';

const BASE = 'http://pharos.local/api/v1/ai';

/** Minimal NextRequest stand-in — the route reads headers.get (authorization only) and json()
 *  (via readBody, never throws on malformed JSON). */
function makeReq(opts: { auth?: string | null; body?: unknown; badJson?: boolean } = {}): NextRequest {
  const auth = opts.auth === undefined ? 'Bearer tok' : opts.auth;
  return {
    url: BASE,
    headers: {
      get: (h: string) => (h.toLowerCase() === 'authorization' ? auth : null),
    },
    json: async () => {
      if (opts.badJson) throw new Error('bad json');
      return opts.body === undefined ? {} : opts.body;
    },
  } as unknown as NextRequest;
}

beforeEach(() => {
  userState.doc = { _id: 'u1', name: 'Achilleas', username: 'ach', role: 'admin' };
  vi.clearAllMocks();
  userFindOne.mockImplementation(() => ({ select: () => ({ lean: async () => userState.doc }) }));
  runAiCommand.mockImplementation(async () => ({ ok: true as const, reply: 'Done.', actions: [] }));
});

describe('auth gate', () => {
  it('no token → 401, never runs the agent', async () => {
    const res = await POST(makeReq({ auth: null, body: { messages: [{ role: 'user', content: 'hi' }] } }));
    expect(res.status).toBe(401);
    expect(runAiCommand).not.toHaveBeenCalled();
  });

  it('unknown token → 401, never runs the agent', async () => {
    userState.doc = null; // bearerUser lookup resolves to no user
    const res = await POST(makeReq({ body: { messages: [{ role: 'user', content: 'hi' }] } }));
    expect(res.status).toBe(401);
    expect(runAiCommand).not.toHaveBeenCalled();
  });
});

describe('messages validation (never throws)', () => {
  it('missing messages → 400, never runs the agent', async () => {
    const res = await POST(makeReq({ body: {} }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'messages required (array of { role, content })' });
    expect(runAiCommand).not.toHaveBeenCalled();
  });

  it('messages not an array → 400, never runs the agent', async () => {
    const res = await POST(makeReq({ body: { messages: 'hi' } }));
    expect(res.status).toBe(400);
    expect(runAiCommand).not.toHaveBeenCalled();
  });

  it('empty array → 400, never runs the agent', async () => {
    const res = await POST(makeReq({ body: { messages: [] } }));
    expect(res.status).toBe(400);
    expect(runAiCommand).not.toHaveBeenCalled();
  });

  it('a malformed JSON body → readBody swallows it to {} → 400, never runs the agent', async () => {
    const res = await POST(makeReq({ badJson: true }));
    expect(res.status).toBe(400);
    expect(runAiCommand).not.toHaveBeenCalled();
  });

  it('entries missing a string content are dropped; nothing left → 400', async () => {
    const res = await POST(
      makeReq({ body: { messages: [null, 'x', { role: 'user' }, { role: 'user', content: 42 }] } })
    );
    expect(res.status).toBe(400);
    expect(runAiCommand).not.toHaveBeenCalled();
  });
});

describe('history sanitation forwarded to runAiCommand', () => {
  it('valid entries pass through, role defaults to user unless exactly assistant', async () => {
    await POST(
      makeReq({
        body: {
          messages: [
            { role: 'user', content: 'add a task' },
            { role: 'assistant', content: 'done' },
            { role: 'system', content: 'sneaky role' }, // not 'assistant' → coerced to 'user'
          ],
        },
      })
    );
    expect(runAiCommand).toHaveBeenCalledOnce();
    expect(runAiCommand.mock.calls[0][0]).toEqual([
      { role: 'user', content: 'add a task' },
      { role: 'assistant', content: 'done' },
      { role: 'user', content: 'sneaky role' },
    ]);
  });

  it('content is hard-capped to 8000 chars', async () => {
    const huge = 'x'.repeat(9000);
    await POST(makeReq({ body: { messages: [{ role: 'user', content: huge }] } }));
    const forwarded = runAiCommand.mock.calls[0][0] as ChatTurn[];
    expect(forwarded[0].content).toHaveLength(8000);
  });

  it('only the most recent 20 raw entries survive the slice, dropping the oldest', async () => {
    const messages = Array.from({ length: 25 }, (_, i) => ({ role: 'user', content: `turn ${i}` }));
    await POST(makeReq({ body: { messages } }));
    const forwarded = runAiCommand.mock.calls[0][0] as ChatTurn[];
    expect(forwarded).toHaveLength(20);
    expect(forwarded[0].content).toBe('turn 5'); // oldest 5 (indices 0-4) dropped
    expect(forwarded[19].content).toBe('turn 24');
  });

  it('runAiCommand is called with only the messages array (no conversationId)', async () => {
    await POST(makeReq({ body: { messages: [{ role: 'user', content: 'hi' }] } }));
    expect(runAiCommand.mock.calls[0]).toHaveLength(1);
  });
});

describe('envelope', () => {
  it('ok result → 200 { reply, actions } — conversationId is not echoed back', async () => {
    runAiCommand.mockResolvedValueOnce({
      ok: true as const,
      reply: 'Added the task.',
      actions: [{ name: 'add_task', summary: 'Added "Buy milk"' }],
      conversationId: 'conv123',
    });
    const res = await POST(makeReq({ body: { messages: [{ role: 'user', content: 'add buy milk' }] } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      reply: 'Added the task.',
      actions: [{ name: 'add_task', summary: 'Added "Buy milk"' }],
    });
  });

  it('not-ok result → 400 { error } with the agent message', async () => {
    runAiCommand.mockResolvedValueOnce({
      ok: false as const,
      reply: '',
      actions: [],
      error: 'The command bar needs the Anthropic provider. Add an API key in Settings → AI.',
    });
    const res = await POST(makeReq({ body: { messages: [{ role: 'user', content: 'hi' }] } }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: 'The command bar needs the Anthropic provider. Add an API key in Settings → AI.',
    });
  });

  it('an empty error falls back to "AI failed"', async () => {
    runAiCommand.mockResolvedValueOnce({ ok: false as const, reply: '', actions: [], error: '' });
    const res = await POST(makeReq({ body: { messages: [{ role: 'user', content: 'hi' }] } }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'AI failed' });
  });
});
