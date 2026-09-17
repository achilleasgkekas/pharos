import { describe, it, expect, vi, beforeEach } from 'vitest';
import { withTenant } from '@/lib/tenancy/current';
import type { TenantContext } from '@/lib/tenancy/context';

// The AI conversation history is one workspace's transcript of what its owner asked the assistant
// and what it did on their behalf. Both halves of that surface used the imported model: the writer
// (aiCommandActions.runAiCommand) and this reader/deleter. In SaaS mode they agreed with each
// other on the DEFAULT database, which is why nothing looked wrong in the UI — everyone was
// reading the same shared list, and `clearConversations` emptied it for all of them at once.
type Op = { model: string; op: string };
const ops = new Map<string, Op[]>();

function log(tag: string, op: string) {
  const list = ops.get(tag) ?? [];
  list.push({ model: 'Conversation', op });
  ops.set(tag, list);
}
const opsOf = (tag: string) => (ops.get(tag) ?? []).map((o) => `${o.model}.${o.op}`);

function makeConversationModel(tag: string) {
  return {
    modelName: 'Conversation',
    find: () => {
      log(tag, 'find');
      return { sort: () => ({ limit: () => ({ lean: async () => [] }) }) };
    },
    updateOne: async () => log(tag, 'updateOne'),
    updateMany: async () => log(tag, 'updateMany'),
  };
}

vi.mock('@/lib/tenancy/connection', () => ({
  currentModel: async (_m: { modelName: string }) => {
    const { currentTenant } = await import('@/lib/tenancy/current');
    const ctx = currentTenant();
    return makeConversationModel(ctx.isDefault || !ctx.tenantId ? 'default' : ctx.slug);
  },
}));
// The real wrapper resolves the tenant from request headers (none in a unit test), so run the body
// inside whatever tenant the test established with `withTenant`.
vi.mock('@/lib/tenancy/request', () => ({
  withRequestTenant: async (fn: () => Promise<unknown>) => fn(),
}));
vi.mock('@/lib/db', () => ({ connectDB: async () => {} }));
// Deliberately empty: a direct `Conversation.find(...)` coming back throws here.
vi.mock('@/models/Conversation', () => ({ Conversation: { modelName: 'Conversation' } }));
vi.mock('@/lib/auth', () => ({ assertCanWrite: async () => {} }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

import { getConversations, deleteConversation, clearConversations } from './actions';

const acme: TenantContext = {
  tenantId: '507f1f77bcf86cd799439011',
  slug: 'acme',
  dbName: 'tenant_acme',
  plan: 'shared',
  status: 'active',
  isDefault: false,
};
const globex: TenantContext = { ...acme, tenantId: '507f1f77bcf86cd799439012', slug: 'globex', dbName: 'tenant_globex' };

beforeEach(() => ops.clear());

describe('history/actions — conversations belong to one workspace', () => {
  it('getConversations reads the current tenant’s transcripts', async () => {
    await withTenant(acme, () => getConversations());
    expect(opsOf('acme')).toEqual(['Conversation.find']);
    expect(opsOf('default')).toEqual([]);
  });

  it('deleteConversation deletes inside the current tenant', async () => {
    await withTenant(acme, () => deleteConversation('507f1f77bcf86cd799439099'));
    expect(opsOf('acme')).toEqual(['Conversation.updateOne']);
    expect(opsOf('default')).toEqual([]);
  });

  it('clearConversations wipes ONLY the caller’s workspace — unscoped it emptied every customer’s history', async () => {
    await withTenant(acme, () => clearConversations());
    expect(opsOf('acme')).toEqual(['Conversation.updateMany']);
    expect(opsOf('globex')).toEqual([]);
    expect(opsOf('default')).toEqual([]);
  });

  it('two workspaces read their own lists', async () => {
    await withTenant(acme, () => getConversations());
    await withTenant(globex, () => getConversations());
    expect(opsOf('acme')).toEqual(['Conversation.find']);
    expect(opsOf('globex')).toEqual(['Conversation.find']);
  });

  it('self-hosted parity: no tenant established → the default connection', async () => {
    await getConversations();
    expect(opsOf('default')).toEqual(['Conversation.find']);
  });
});
