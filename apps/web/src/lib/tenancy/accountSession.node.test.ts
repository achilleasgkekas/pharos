import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getCurrentAccount } from './accountSession';
import { Account } from '@/models/Account';
import { cookies } from 'next/headers';
import { signAccountToken, ACCOUNT_COOKIE } from './accountToken';

vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  connectDB: vi.fn(),
}));

vi.mock('@/models/Account', () => ({
  Account: {
    findById: vi.fn(),
    findByIdAndUpdate: vi.fn(),
  },
}));

describe('getCurrentAccount with epoch', () => {
  beforeEach(() => {
    process.env.AUTH_SECRET = 'test-secret-at-least-16-chars-long';
  });

  it('fails if token epoch does not match db epoch', async () => {
    const store = new Map();
    vi.mocked(cookies).mockResolvedValue({
      get: (n: string) => ({ value: store.get(n) }),
      set: (n: string, v: string) => store.set(n, v),
    } as any);

    // Mock DB account with epoch 2
    vi.mocked(Account.findById).mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({ sessionEpoch: 2 })
      })
    } as any);

    // Set a token with epoch 1
    const token = await signAccountToken({ sub: 'acc-1', email: 'a@b.com', epoch: 1 });
    store.set(ACCOUNT_COOKIE, token);

    const result = await getCurrentAccount();
    expect(result).toBeNull();
  });
});
