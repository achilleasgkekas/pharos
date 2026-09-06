import { describe, it, expect, beforeEach, vi } from 'vitest';
import { withTenant } from '@/lib/tenancy/current';
import type { TenantContext } from '@/lib/tenancy/context';

// getBulkAiGuard is what the /jobs page asks before it starts a PAID bulk AI run: may I
// skip the confirmation, and which provider/model is about to be billed. Both halves used
// to answer out of the DEFAULT database — the aiConfirmBulk toggle came from a direct
// AppConfig.findOne, and getAiConfig() reads whatever tenant is ambient, which outside a
// wrap is the default one. So in SaaS a workspace that had deliberately turned the
// confirmation ON could be shown someone else's OFF, and the cost estimate named a model
// it was not going to use. This file pins that both halves now follow the caller.
//
// The rest of jobActions.ts (the Job queue itself) is deliberately NOT covered here: it has
// no tenancy at all, and moving it is the open pharos-brain-20260906-0250 question, because
// the worker in lib/jobRunner.ts is a process-global loop with no request context.
const seen: string[] = [];

/** An AppConfig stand-in that records which tenant it was resolved for. */
function makeAppConfig(tag: string, confirmBulk: boolean) {
  return {
    modelName: 'AppConfig',
    findOne: () => ({
      select: () => ({
        lean: async () => {
          seen.push(tag);
          return { aiConfirmBulk: confirmBulk };
        },
      }),
    }),
  };
}

// Per-tenant toggles: workspace `alpha` wants the confirmation, `beta` has switched it off,
// and the default database says off too — so a leak reads as `alpha` losing its guard.
const CONFIRM_BY_TENANT: Record<string, boolean> = { alpha: true, beta: false, default: false };
const MODEL_BY_TENANT: Record<string, string> = { alpha: 'qwen-alpha', beta: 'qwen-beta', default: 'qwen-default' };

vi.mock('@/lib/tenancy/connection', () => ({
  currentModel: async (_m: unknown) => {
    const { currentTenant } = await import('@/lib/tenancy/current');
    const ctx = currentTenant();
    const t = ctx.isDefault || !ctx.tenantId ? 'default' : ctx.slug;
    return makeAppConfig(t, CONFIRM_BY_TENANT[t] ?? false);
  },
}));
// The real wrapper resolves the tenant from request headers (none in a unit test), so run
// the body inside whatever tenant the test established with `withTenant`.
vi.mock('@/lib/tenancy/request', () => ({
  withRequestTenant: async (fn: () => Promise<unknown>) => fn(),
}));
// getAiConfig is already ambient-tenant aware in production; mirror that here so the test
// can tell whether the WRAP was opened, not just whether the model was rebound.
vi.mock('@/lib/aiConfig', () => ({
  getAiConfig: async () => {
    const { currentTenant } = await import('@/lib/tenancy/current');
    const ctx = currentTenant();
    const t = ctx.isDefault || !ctx.tenantId ? 'default' : ctx.slug;
    return { provider: 'ollama', anthropicModel: 'claude-x', ollamaModel: MODEL_BY_TENANT[t] };
  },
}));
vi.mock('@/lib/db', () => ({ connectDB: async () => {} }));
// Name-only on purpose: a direct `AppConfig.findOne(...)` that skipped currentModel would
// throw here instead of quietly reading the default database.
vi.mock('@/models/AppConfig', () => ({ AppConfig: { modelName: 'AppConfig' } }));
vi.mock('@/models/Job', () => ({ Job: { modelName: 'Job' } }));
vi.mock('@/lib/jobRunner', () => ({ ensureProcessor: async () => {} }));
vi.mock('@/lib/aiFeatures.server', () => ({ isFeatureEnabled: async () => true }));
vi.mock('./settings/actions', () => ({ getSyncManifest: async () => ({ ok: true, items: [] }) }));
vi.mock('@/lib/auth', () => ({ assertCanWrite: async () => {} }));

import { getBulkAiGuard } from './jobActions';

function ctx(slug: string): TenantContext {
  return { tenantId: `id-${slug}`, slug, isDefault: false } as TenantContext;
}

describe('getBulkAiGuard answers for the CURRENT workspace', () => {
  beforeEach(() => {
    seen.length = 0;
  });

  it('reads the confirm toggle from the calling workspace, not the default one', async () => {
    const r = await withTenant(ctx('alpha'), () => getBulkAiGuard());
    expect(r.confirm).toBe(true); // alpha wants the guard; default says false
    expect(seen).toEqual(['alpha']);
  });

  it('names the model the calling workspace would actually be billed for', async () => {
    const r = await withTenant(ctx('beta'), () => getBulkAiGuard());
    expect(r.model).toBe('qwen-beta');
    expect(r.provider).toBe('ollama');
  });

  it('keeps two workspaces apart across consecutive calls', async () => {
    const a = await withTenant(ctx('alpha'), () => getBulkAiGuard());
    const b = await withTenant(ctx('beta'), () => getBulkAiGuard());
    expect([a.confirm, b.confirm]).toEqual([true, false]);
    expect([a.model, b.model]).toEqual(['qwen-alpha', 'qwen-beta']);
    expect(seen).toEqual(['alpha', 'beta']);
  });

  it('self-hosted parity: with no tenant established it reads the default database', async () => {
    const r = await getBulkAiGuard();
    expect(seen).toEqual(['default']);
    expect(r.model).toBe('qwen-default');
    expect(r.confirm).toBe(false);
  });
});
