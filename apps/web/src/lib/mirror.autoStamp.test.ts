import { describe, it, expect, vi, beforeEach } from 'vitest';

// mirror.test.ts covers this module's PURE path helpers with no mocks at all. This
// separate slice exists for the one impure behaviour that P48 added: auto-mirror-on-
// verify recording that the remote copy is now current.
//
// Why it needs its own file with a full mock set, and why it matters: auto-mirror is
// the push path that runs WITHOUT anyone clicking anything. If it did not stamp the
// clock, a user whose mirror works perfectly on every verify would still be nagged
// every 7 days that their backup has fallen behind, which is precisely how a warning
// gets trained into background noise. The mirror also swallows its own errors by
// design (a NAS being down must never break an upload), so the stamp is the only
// externally visible evidence that a push actually succeeded.

const { getStorageConfigMock, pushToRemoteMock, uploadToOnedriveMock, readFileMock, markRemoteSyncMock, renderStoragePathMock } = vi.hoisted(() => ({
  getStorageConfigMock: vi.fn(async () => ({ backend: 'ftp', mirror: true, folderTemplate: 'f', fileNameTemplate: 'n', remote: { host: 'nas.local' } }) as Record<string, unknown>),
  pushToRemoteMock: vi.fn(async () => ({ ok: true }) as { ok: boolean; error?: string }),
  uploadToOnedriveMock: vi.fn(async () => ({ ok: true }) as { ok: boolean; error?: string }),
  readFileMock: vi.fn(async () => Buffer.from('bytes')),
  markRemoteSyncMock: vi.fn(async () => {}),
  renderStoragePathMock: vi.fn(() => 'receipts/2026/08/file.pdf'),
}));

vi.mock('./storageConfig', () => ({ getStorageConfig: getStorageConfigMock }));
vi.mock('./remoteStorage', () => ({ pushToRemote: pushToRemoteMock }));
vi.mock('./onedrive', () => ({ uploadToOnedrive: uploadToOnedriveMock, downloadFromOnedrive: vi.fn(), createShareLink: vi.fn() }));
vi.mock('./storage', () => ({ readFile: readFileMock }));
vi.mock('./storagePath', () => ({ renderStoragePath: renderStoragePathMock }));
vi.mock('./syncState', () => ({ markRemoteSync: markRemoteSyncMock }));

import { mirrorFileToRemote } from './mirror';

const META = { kind: 'receipts' as const, store: 'Plaisio', date: '2026-08-01', total: 42, id: 'abc123' };
const remoteFtp = { backend: 'ftp', mirror: true, folderTemplate: 'f', fileNameTemplate: 'n', remote: { host: 'nas.local' } };

beforeEach(() => {
  vi.clearAllMocks();
  getStorageConfigMock.mockImplementation(async () => ({ ...remoteFtp }));
  pushToRemoteMock.mockImplementation(async () => ({ ok: true }));
  uploadToOnedriveMock.mockImplementation(async () => ({ ok: true }));
  readFileMock.mockImplementation(async () => Buffer.from('bytes'));
  renderStoragePathMock.mockImplementation(() => 'receipts/2026/08/file.pdf');
});

describe('mirrorFileToRemote · recording a successful auto-mirror (P48)', () => {
  it('stamps the sync clock after a successful SMB/FTP push', async () => {
    await mirrorFileToRemote(META, 'receipts/a.pdf');
    expect(pushToRemoteMock).toHaveBeenCalledTimes(1);
    expect(markRemoteSyncMock).toHaveBeenCalledTimes(1);
  });

  it('stamps it after a successful OneDrive upload too', async () => {
    getStorageConfigMock.mockImplementationOnce(async () => ({ ...remoteFtp, backend: 'onedrive' }));
    await mirrorFileToRemote(META, 'receipts/a.pdf');
    expect(uploadToOnedriveMock).toHaveBeenCalledTimes(1);
    expect(markRemoteSyncMock).toHaveBeenCalledTimes(1);
  });

  it('does NOT stamp it when the push failed', async () => {
    // The push path reports failure by returning {ok:false}, not by throwing, so a
    // missing check here would mark a mirror "current" on the exact runs it is broken.
    pushToRemoteMock.mockImplementationOnce(async () => ({ ok: false, error: 'connection refused' }));
    await mirrorFileToRemote(META, 'receipts/a.pdf');
    expect(markRemoteSyncMock).not.toHaveBeenCalled();
  });

  it('does NOT stamp it when the local file could not be read', async () => {
    readFileMock.mockImplementationOnce(async () => { throw new Error('ENOENT'); });
    await expect(mirrorFileToRemote(META, 'receipts/gone.pdf')).resolves.toBeUndefined();
    expect(markRemoteSyncMock).not.toHaveBeenCalled();
  });

  it('does NOT stamp it on any path where no push is attempted', async () => {
    // Local backend, auto-mirror off, and a remote with no host all return early.
    for (const cfg of [{ backend: 'local' }, { mirror: false }, { remote: { host: '' } }]) {
      getStorageConfigMock.mockImplementationOnce(async () => ({ ...remoteFtp, ...cfg }));
      await mirrorFileToRemote(META, 'receipts/a.pdf');
    }
    // Same for an empty filePath, the earliest guard of all.
    await mirrorFileToRemote(META, '');
    expect(pushToRemoteMock).not.toHaveBeenCalled();
    expect(markRemoteSyncMock).not.toHaveBeenCalled();
  });
});
