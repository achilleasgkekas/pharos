import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const access = vi.fn();
const list = vi.fn();
const close = vi.fn();

vi.mock('basic-ftp', () => ({
  Client: class {
    access = access;
    list = list;
    close = close;
  },
}));

import { testRemote } from './remoteStorage';

describe('FTPS transport security', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    access.mockResolvedValue(undefined);
    list.mockResolvedValue([]);
  });

  it('requires certificate verification for secure FTP connections', async () => {
    await expect(
      testRemote({ backend: 'ftp', host: 'nas.example.test', user: 'backup', pass: 'secret', secure: true })
    ).resolves.toEqual({ ok: true });

    expect(access).toHaveBeenCalledWith(
      expect.objectContaining({ secure: true, secureOptions: { rejectUnauthorized: true } })
    );
  });
});
