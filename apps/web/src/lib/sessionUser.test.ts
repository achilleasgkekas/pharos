import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { signSession, signMfaPendingToken } from './session';
import { validateSessionToken } from './sessionUser';
const { account, connect } = vi.hoisted(() => ({ account: vi.fn(), connect: vi.fn() }));
vi.mock('./db', () => ({ connectDB: connect }));
vi.mock('@/models/User', () => ({ User: { findById: () => ({ select: () => ({ lean: account }) }) } }));
beforeEach(() => {
  vi.stubEnv('AUTH_SECRET', 'synthetic-security-test-secret-only');
  connect.mockResolvedValue(undefined);
  account.mockResolvedValue({ name: 'Current', username: 'owner', role: 'viewer', sessionEpoch: 0 });
});
afterEach(() => vi.unstubAllEnvs());
const token = (epoch: number | undefined = 0) => signSession({ sub: 'u1', name: 'Old', role: 'admin', epoch });
it('uses current database role, not the signed stale admin role', async () => {
  expect(await validateSessionToken(await token())).toMatchObject({ role: 'viewer', name: 'Current' });
});
it('rejects a deleted user even with epoch zero', async () => {
  account.mockResolvedValue(null);
  expect(await validateSessionToken(await token())).toBeNull();
});
it('rejects revoked sessions', async () => {
  account.mockResolvedValue({ role: 'admin', sessionEpoch: 1 });
  expect(await validateSessionToken(await token())).toBeNull();
});
it('fails closed on a database outage', async () => {
  connect.mockRejectedValue(new Error('offline'));
  expect(await validateSessionToken(await token())).toBeNull();
});
it('rejects sessions without a revocation epoch and pending MFA tokens', async () => {
  expect(await validateSessionToken(await signSession({ sub: 'u1', role: 'admin', name: 'A' }))).toBeNull();
  expect(await validateSessionToken(await signMfaPendingToken('u1'))).toBeNull();
});
it.each([-1, 1.5, Number.MAX_SAFE_INTEGER + 1])('rejects invalid epoch %s', async (epoch) => {
  expect(await validateSessionToken(await token(epoch))).toBeNull();
});
