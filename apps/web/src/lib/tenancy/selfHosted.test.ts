import { afterEach, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';
import { DEFAULT_TENANT } from './context';
import { currentModel, getTenantConnection, tenantDb } from './connection';
import { currentTenant, withTenant } from './current';
import { resolveRequestTenant, withRequestTenant } from './request';

vi.mock('@/lib/db', () => ({ connectDB: async () => mongoose }));
vi.mock('next/headers', () => ({ headers: () => { throw new Error('Host must not select a database'); } }));
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

it('keeps real Mongoose models on the original connection with a stale SaaS environment', async () => {
  vi.stubEnv('SAAS_MODE', 'on');
  const model = mongoose.models.RetirementCheck ?? mongoose.model('RetirementCheck', new mongoose.Schema({ name: String }));
  const switchDb = vi.spyOn(mongoose.connection, 'useDb');
  expect(await resolveRequestTenant()).toBe(DEFAULT_TENANT);
  const bound = await withRequestTenant(() => currentModel(model));
  expect(bound).toBe(model);
  expect(bound.db).toBe(mongoose.connection);
  expect(switchDb).not.toHaveBeenCalled();
});

it('rejects retired database contexts before invoking any feature write', async () => {
  const old = { ...DEFAULT_TENANT, isDefault: false, tenantId: 'old', dbName: 'tenant_old' };
  const write = vi.fn();
  expect(() => withTenant(old, write)).toThrow('no longer supported');
  expect(write).not.toHaveBeenCalled();
  await expect(tenantDb(old)).rejects.toThrow('no longer supported');
  await expect(getTenantConnection('tenant_old')).rejects.toThrow('no longer supported');
  expect(currentTenant()).toBe(DEFAULT_TENANT);
});

it('preserves nested asynchronous feature results and errors', async () => {
  await expect(withRequestTenant(() => withRequestTenant(async () => 42))).resolves.toBe(42);
  const error = new Error('database unavailable');
  await expect(withRequestTenant(async () => { throw error; })).rejects.toBe(error);
});
