import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Connection, Model } from 'mongoose';
import { DEFAULT_TENANT, type TenantContext } from './context';
import { withTenant } from './current';

// currentModel is the tenant-bound model accessor feature actions use in place of importing
// a model directly. The two contracts under test:
//   1. OSS PARITY: for the DEFAULT_TENANT (empty dbName) it returns the ORIGINAL model on the
//      DEFAULT connection — no useDb switch, so self-hosted queries are byte-for-byte the same.
//   2. SAAS ROUTING: for a real tenant (non-empty dbName) it binds the model to that tenant's
//      useDb connection so queries hit the tenant database.
//
// We mock @/lib/db so there's no live Mongo: a fake default connection whose useDb() returns a
// distinct tenant connection lets us assert exactly which connection the model was bound to.

// A tenant connection: models registered on it are tracked so we can assert rebinding.
function makeConn(name: string): Connection & { __name: string } {
  const models: Record<string, unknown> = {};
  const conn = {
    __name: name,
    models,
    model: (modelName: string, schema: unknown) => {
      const m = { modelName, schema, __conn: name } as unknown;
      models[modelName] = m;
      return m;
    },
    readyState: 1,
  } as unknown as Connection & { __name: string };
  return conn;
}

const defaultConn = makeConn('default');
const tenantConn = makeConn('tenant_acme');
// The default connection's useDb(name) yields the per-tenant connection.
(defaultConn as unknown as { useDb: (n: string, o?: unknown) => Connection }).useDb = vi.fn(() => tenantConn);

vi.mock('@/lib/db', () => ({
  connectDB: async () => ({ connection: defaultConn }),
}));

import { currentModel, tenantModel } from './connection';

// A stand-in feature model: identity is enough to assert "returned unchanged".
const OriginalModel = { modelName: 'Item', schema: { __schema: true } } as unknown as Model<unknown>;
// In production, feature models are ALREADY compiled on the default connection — so
// tenantModel(defaultConn, Item) finds it in defaultConn.models and returns it unchanged.
// Mirror that so the OSS-parity assertion reflects real behaviour.
(defaultConn.models as Record<string, unknown>)[OriginalModel.modelName] = OriginalModel;

const acme: TenantContext = {
  tenantId: '507f1f77bcf86cd799439011',
  slug: 'acme',
  dbName: 'tenant_acme',
  plan: 'shared',
  status: 'active',
  isDefault: false,
};

beforeEach(() => {
  // Reset the tenant connection's model registry between tests.
  for (const k of Object.keys(tenantConn.models)) delete (tenantConn.models as Record<string, unknown>)[k];
  (defaultConn as unknown as { useDb: ReturnType<typeof vi.fn> }).useDb.mockClear();
});

describe('currentModel — OSS / self-hosted (default tenant)', () => {
  it('returns the ORIGINAL model untouched (no useDb switch) when no tenant is established', async () => {
    // Outside any withTenant the ambient tenant is DEFAULT_TENANT (empty dbName).
    const M = await currentModel(OriginalModel);

    expect(M).toBe(OriginalModel);
    expect((defaultConn as unknown as { useDb: ReturnType<typeof vi.fn> }).useDb).not.toHaveBeenCalled();
  });

  it('returns the original model even when DEFAULT_TENANT is explicitly established', async () => {
    const M = await withTenant(DEFAULT_TENANT, () => currentModel(OriginalModel));
    expect(M).toBe(OriginalModel);
    expect((defaultConn as unknown as { useDb: ReturnType<typeof vi.fn> }).useDb).not.toHaveBeenCalled();
  });
});

describe('currentModel — SaaS routing (real tenant)', () => {
  it('rebinds the model to the tenant useDb connection', async () => {
    const M = (await withTenant(acme, () => currentModel(OriginalModel))) as unknown as { __conn: string };

    // The tenant db was switched to and the model recompiled on that connection.
    expect((defaultConn as unknown as { useDb: ReturnType<typeof vi.fn> }).useDb).toHaveBeenCalledWith('tenant_acme', { useCache: true });
    expect(M).not.toBe(OriginalModel);
    expect(M.__conn).toBe('tenant_acme');
  });
});

describe('tenantModel', () => {
  it('reuses an already-compiled model on the same connection', () => {
    const first = tenantModel(tenantConn, OriginalModel);
    const second = tenantModel(tenantConn, OriginalModel);
    expect(second).toBe(first);
  });
});
