import { describe, it, expect, vi, beforeEach } from 'vitest';

// app/history/actions.ts backs the /history page — the saved AI command-bar
// conversation log. Behaviour pinned:
//  - getConversations: Conversation.find({}).sort({updatedAt:-1}).limit(200).lean(),
//    mapped into ConversationRow — title/turns default when falsy ('Conversation'/0),
//    updatedAt.toISOString(), messages default content/actions when missing, and
//    `preview` is the LAST assistant message's content (searching from the end, not
//    the first assistant turn) with markdown ** stripped and capped at 160 chars —
//    empty string when there is no assistant message at all.
//  - deleteConversation: deleteOne({_id}), revalidates /history, returns {ok:true}.
//  - clearConversations: deleteMany({}), revalidates /history, returns {ok:true}.

const { connectDBMock, convFind, convDeleteOne, convDeleteMany, findQuery, revalidatePathMock, state } = vi.hoisted(() => {
  const state: { docs: unknown[] } = { docs: [] };
  // Conversation.find({}).sort(...).limit(...).lean() — a self-returning chain.
  const findQuery: Record<string, unknown> = {};
  for (const m of ['sort', 'limit']) findQuery[m] = vi.fn(() => findQuery);
  findQuery.lean = vi.fn(async () => state.docs);
  const convFind = vi.fn(() => findQuery);
  return {
    connectDBMock: vi.fn(async () => {}),
    convFind,
    convDeleteOne: vi.fn(async (_q?: unknown) => {}),
    convDeleteMany: vi.fn(async (_q?: unknown) => {}),
    findQuery,
    revalidatePathMock: vi.fn(),
    state,
  };
});

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
// Behaviour tests stay FLAT (see actions.tenant.test.ts for the routing half).
vi.mock('@/lib/tenancy/request', () => ({ withRequestTenant: async (fn: () => Promise<unknown>) => fn() }));
vi.mock('@/lib/tenancy/connection', () => ({ currentModel: async (m: unknown) => m }));
vi.mock('@/models/Conversation', () => ({
  Conversation: { find: convFind, deleteOne: convDeleteOne, deleteMany: convDeleteMany },
}));
vi.mock('next/cache', () => ({ revalidatePath: revalidatePathMock }));

import { getConversations, deleteConversation, clearConversations } from './actions';

beforeEach(() => {
  vi.clearAllMocks();
  connectDBMock.mockImplementation(async () => {});
  state.docs = [];
});

describe('getConversations', () => {
  it('queries newest-first, capped at 200, via connectDB → find({}).sort().limit(200).lean()', async () => {
    await getConversations();
    expect(connectDBMock).toHaveBeenCalledTimes(1);
    expect(convFind).toHaveBeenCalledWith({});
    expect(findQuery.sort).toHaveBeenCalledWith({ updatedAt: -1 });
    expect(findQuery.limit).toHaveBeenCalledWith(200);
  });

  it('maps a full doc: id stringified, updatedAt ISO, messages carry role/content/actions', async () => {
    state.docs = [
      {
        _id: { toString: () => 'c1' },
        title: 'Add a subscription',
        turns: 2,
        updatedAt: new Date('2026-07-20T10:00:00Z'),
        messages: [
          { role: 'user', content: 'Add Netflix', actions: [] },
          { role: 'assistant', content: 'Done', actions: [{ name: 'add_subscription', summary: 'Netflix €15/mo' }] },
        ],
      },
    ];
    const rows = await getConversations();
    expect(rows).toEqual([
      {
        id: 'c1',
        title: 'Add a subscription',
        turns: 2,
        updatedAt: '2026-07-20T10:00:00.000Z',
        preview: 'Done',
        messages: [
          { role: 'user', content: 'Add Netflix', actions: [] },
          { role: 'assistant', content: 'Done', actions: [{ name: 'add_subscription', summary: 'Netflix €15/mo' }] },
        ],
      },
    ]);
  });

  it('defaults title to "Conversation" and turns to 0 when falsy', async () => {
    state.docs = [{ _id: 'c2', title: '', turns: 0, updatedAt: new Date('2026-01-01T00:00:00Z'), messages: [] }];
    const [row] = await getConversations();
    expect(row.title).toBe('Conversation');
    expect(row.turns).toBe(0);
  });

  it('defaults a message missing content/actions to "" / []', async () => {
    state.docs = [
      {
        _id: 'c3',
        title: 'x',
        turns: 1,
        updatedAt: new Date('2026-01-01T00:00:00Z'),
        messages: [{ role: 'user' }],
      },
    ];
    const [row] = await getConversations();
    expect(row.messages).toEqual([{ role: 'user', content: '', actions: [] }]);
  });

  it('preview uses the LAST assistant message, not the first', async () => {
    state.docs = [
      {
        _id: 'c4',
        title: 'x',
        turns: 3,
        updatedAt: new Date('2026-01-01T00:00:00Z'),
        messages: [
          { role: 'assistant', content: 'first reply' },
          { role: 'user', content: 'again' },
          { role: 'assistant', content: 'final reply' },
        ],
      },
    ];
    const [row] = await getConversations();
    expect(row.preview).toBe('final reply');
  });

  it('preview strips markdown ** and caps at 160 chars', async () => {
    const long = 'x'.repeat(200);
    state.docs = [
      {
        _id: 'c5',
        title: 'x',
        turns: 1,
        updatedAt: new Date('2026-01-01T00:00:00Z'),
        messages: [{ role: 'assistant', content: `**bold** ${long}` }],
      },
    ];
    const [row] = await getConversations();
    expect(row.preview).not.toContain('**');
    expect(row.preview.length).toBe(160);
    expect(row.preview.startsWith('bold ')).toBe(true);
  });

  it('preview is "" when there is no assistant message at all', async () => {
    state.docs = [
      { _id: 'c6', title: 'x', turns: 1, updatedAt: new Date('2026-01-01T00:00:00Z'), messages: [{ role: 'user', content: 'hello' }] },
    ];
    const [row] = await getConversations();
    expect(row.preview).toBe('');
  });

  it('returns [] when there are no conversations', async () => {
    state.docs = [];
    expect(await getConversations()).toEqual([]);
  });
});

describe('deleteConversation', () => {
  it('deletes by id, revalidates /history, returns ok:true', async () => {
    const res = await deleteConversation('c1');
    expect(connectDBMock).toHaveBeenCalledTimes(1);
    expect(convDeleteOne).toHaveBeenCalledWith({ _id: 'c1' });
    expect(revalidatePathMock).toHaveBeenCalledWith('/history');
    expect(res).toEqual({ ok: true });
  });
});

describe('clearConversations', () => {
  it('deletes all, revalidates /history, returns ok:true', async () => {
    const res = await clearConversations();
    expect(connectDBMock).toHaveBeenCalledTimes(1);
    expect(convDeleteMany).toHaveBeenCalledWith({});
    expect(revalidatePathMock).toHaveBeenCalledWith('/history');
    expect(res).toEqual({ ok: true });
  });
});
