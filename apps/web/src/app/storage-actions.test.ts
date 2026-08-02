import { describe, it, expect, vi, beforeEach } from 'vitest';

// Two thin UI-gating helpers around the OneDrive mirror. Behaviour pinned:
//  - onedriveEnabled() is a cheap read of the storage backend, letting an "Open in
//    OneDrive" button gate itself without prop-drilling a flag through every page.
//  - getOnedriveShareLink() rejects an empty path up front (no DB lookup at all),
//    otherwise defers entirely to shareLinkByPath and just reshapes null → an error.

const { getStorageConfigMock, shareLinkByPathMock } = vi.hoisted(() => ({
  getStorageConfigMock: vi.fn(),
  shareLinkByPathMock: vi.fn(),
}));

vi.mock('@/lib/storageConfig', () => ({ getStorageConfig: getStorageConfigMock }));
vi.mock('@/lib/mirror', () => ({ shareLinkByPath: shareLinkByPathMock }));

import { onedriveEnabled, getOnedriveShareLink } from './storage-actions';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('onedriveEnabled', () => {
  it('is true when the storage backend is onedrive', async () => {
    getStorageConfigMock.mockResolvedValue({ backend: 'onedrive' });
    expect(await onedriveEnabled()).toBe(true);
  });

  it.each(['local', 'ftp', 'smb'])('is false for the %s backend', async (backend) => {
    getStorageConfigMock.mockResolvedValue({ backend });
    expect(await onedriveEnabled()).toBe(false);
  });
});

describe('getOnedriveShareLink', () => {
  it('rejects an empty path without calling shareLinkByPath', async () => {
    const res = await getOnedriveShareLink('');
    expect(res).toEqual({ error: 'No file' });
    expect(shareLinkByPathMock).not.toHaveBeenCalled();
  });

  it('returns the url when shareLinkByPath resolves one', async () => {
    shareLinkByPathMock.mockResolvedValue('https://onedrive.example/share/abc');
    const res = await getOnedriveShareLink('receipts/2026/06/file.pdf');
    expect(res).toEqual({ url: 'https://onedrive.example/share/abc' });
    expect(shareLinkByPathMock).toHaveBeenCalledWith('receipts/2026/06/file.pdf');
  });

  it('maps a null resolution (no match / not mirrored) to a friendly error', async () => {
    shareLinkByPathMock.mockResolvedValue(null);
    const res = await getOnedriveShareLink('items/photo.jpg');
    expect(res).toEqual({ error: 'Could not create a OneDrive link' });
  });
});
