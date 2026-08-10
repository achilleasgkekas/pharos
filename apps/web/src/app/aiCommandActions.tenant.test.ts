import { describe, it, expect, vi, beforeEach } from 'vitest';
import { withTenant } from '@/lib/tenancy/current';
import type { TenantContext } from '@/lib/tenancy/context';

// runAiCommand is the ENTRY POINT that opens the tenant gate for the whole command-bar surface,
// and that is what makes aiTools' per-model scoping mean anything: execute() does not gate itself.
// So the thing worth pinning here is not a query, it is that the gate wraps EVERYTHING — the
// config read (whose API key), the feature check (whose AI switches), the model call (whose
// quota), the tool run (whose records) and the transcript write — rather than only the last one.
const { gateCalls, order, conversationCreate } = vi.hoisted(() => ({
  gateCalls: [] as string[],
  order: [] as string[],
  conversationCreate: vi.fn(async () => ({ _id: 'c1' })),
}));

vi.mock('@/lib/tenancy/request', () => ({
  withRequestTenant: async (fn: () => Promise<unknown>) => {
    const { currentTenant } = await import('@/lib/tenancy/current');
    const ctx = currentTenant();
    gateCalls.push(ctx.isDefault || !ctx.tenantId ? 'default' : ctx.slug);
    order.push('gate');
    return fn();
  },
}));
vi.mock('@/lib/tenancy/connection', () => ({
  currentModel: async () => ({
    create: conversationCreate,
    updateOne: vi.fn(async () => ({})),
  }),
}));
vi.mock('@/lib/aiConfig', () => ({
  getAiConfig: async () => {
    order.push('getAiConfig');
    return { anthropicApiKey: 'sk-test', anthropicModel: 'claude-x' };
  },
}));
vi.mock('@/lib/aiFeatures.server', () => ({
  isFeatureEnabled: async () => {
    order.push('isFeatureEnabled');
    return true;
  },
}));
vi.mock('@/lib/anthropic', () => ({
  anthropicRaw: async () => {
    order.push('anthropicRaw');
    return { content: [{ type: 'text', text: 'Done.' }] };
  },
}));
vi.mock('./aiTools', () => ({
  TOOLS: [],
  execute: async () => ({ summary: 's', content: 'c' }),
  SYSTEM: 'sys',
  today: () => '2026-08-10',
}));
vi.mock('@/lib/db', () => ({ connectDB: async () => {} }));
vi.mock('@/lib/auth', () => ({ assertCanWrite: async () => {}, getCurrentUser: async () => null }));
vi.mock('@/models/Conversation', () => ({ Conversation: { modelName: 'Conversation' } }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

import { runAiCommand } from './aiCommandActions';

const acme: TenantContext = {
  tenantId: '507f1f77bcf86cd799439011',
  slug: 'acme',
  dbName: 'tenant_acme',
  plan: 'shared',
  status: 'active',
  isDefault: false,
};

beforeEach(() => {
  gateCalls.length = 0;
  order.length = 0;
  conversationCreate.mockClear();
});

describe('runAiCommand — the gate wraps the whole command, not just the write', () => {
  it('runs inside the caller’s workspace', async () => {
    const r = await withTenant(acme, () => runAiCommand([{ role: 'user', content: 'hi' }]));
    expect(r.ok).toBe(true);
    expect(gateCalls).toEqual(['acme']);
  });

  it('opens the gate BEFORE reading the AI config, checking the feature switch and calling the model — each of those answers "whose"', async () => {
    await withTenant(acme, () => runAiCommand([{ role: 'user', content: 'hi' }]));
    expect(order[0]).toBe('gate');
    expect(order.indexOf('gate')).toBeLessThan(order.indexOf('isFeatureEnabled'));
    expect(order.indexOf('gate')).toBeLessThan(order.indexOf('getAiConfig'));
    expect(order.indexOf('gate')).toBeLessThan(order.indexOf('anthropicRaw'));
  });

  it('stores the transcript through the tenant-scoped model, never the imported one', async () => {
    await withTenant(acme, () => runAiCommand([{ role: 'user', content: 'hi' }]));
    expect(conversationCreate).toHaveBeenCalledTimes(1);
  });

  it('an early refusal is still inside the gate (a rejected command must not be answered from another workspace’s settings)', async () => {
    await withTenant(acme, () => runAiCommand([]));
    expect(gateCalls).toEqual(['acme']);
  });

  it('self-hosted parity: the gate still runs, resolving to the default tenant', async () => {
    const r = await runAiCommand([{ role: 'user', content: 'hi' }]);
    expect(r.ok).toBe(true);
    expect(gateCalls).toEqual(['default']);
  });
});
