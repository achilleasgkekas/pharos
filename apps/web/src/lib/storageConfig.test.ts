import { describe, it, expect } from 'vitest';
import { normalizeStorageConfig } from './storageConfig';
import { DEFAULT_FOLDER_TEMPLATE, DEFAULT_NAME_TEMPLATE } from './storagePath';

describe('normalizeStorageConfig', () => {
  it('returns local defaults for null/undefined/empty doc', () => {
    const expected = {
      backend: 'local',
      mirror: false,
      folderTemplate: DEFAULT_FOLDER_TEMPLATE,
      fileNameTemplate: DEFAULT_NAME_TEMPLATE,
      remote: {
        backend: 'ftp',
        host: '',
        port: 0,
        user: '',
        pass: '',
        share: '',
        basePath: '',
        secure: false,
      },
      hasPass: false,
      mirror2: null,
      hasPass2: false,
    };
    expect(normalizeStorageConfig(null)).toEqual(expected);
    expect(normalizeStorageConfig(undefined)).toEqual(expected);
    expect(normalizeStorageConfig({})).toEqual(expected);
  });

  it('accepts the three non-local backends', () => {
    expect(normalizeStorageConfig({ storageBackend: 'ftp' }).backend).toBe('ftp');
    expect(normalizeStorageConfig({ storageBackend: 'smb' }).backend).toBe('smb');
    expect(normalizeStorageConfig({ storageBackend: 'onedrive' }).backend).toBe('onedrive');
  });

  it('falls back to local for unknown/blank backend values', () => {
    expect(normalizeStorageConfig({ storageBackend: 'local' }).backend).toBe('local');
    expect(normalizeStorageConfig({ storageBackend: 's3' }).backend).toBe('local');
    expect(normalizeStorageConfig({ storageBackend: '' }).backend).toBe('local');
  });

  it('sets remote.backend to smb only for the smb backend, ftp otherwise', () => {
    expect(normalizeStorageConfig({ storageBackend: 'smb' }).remote.backend).toBe('smb');
    expect(normalizeStorageConfig({ storageBackend: 'ftp' }).remote.backend).toBe('ftp');
    // onedrive and local both map remote.backend to ftp (remote is only valid for ftp/smb)
    expect(normalizeStorageConfig({ storageBackend: 'onedrive' }).remote.backend).toBe('ftp');
    expect(normalizeStorageConfig({ storageBackend: 'local' }).remote.backend).toBe('ftp');
  });

  it('coerces storageMirror and remoteSecure to booleans', () => {
    expect(normalizeStorageConfig({ storageMirror: true }).mirror).toBe(true);
    expect(normalizeStorageConfig({ storageMirror: false }).mirror).toBe(false);
    expect(normalizeStorageConfig({}).mirror).toBe(false);
    expect(normalizeStorageConfig({ remoteSecure: true }).remote.secure).toBe(true);
    expect(normalizeStorageConfig({ remoteSecure: false }).remote.secure).toBe(false);
  });

  it('keeps stored templates but falls back to defaults on empty strings', () => {
    const v = normalizeStorageConfig({
      folderTemplate: '{store}/{year}',
      fileNameTemplate: '{id}',
    });
    expect(v.folderTemplate).toBe('{store}/{year}');
    expect(v.fileNameTemplate).toBe('{id}');

    const empty = normalizeStorageConfig({ folderTemplate: '', fileNameTemplate: '' });
    expect(empty.folderTemplate).toBe(DEFAULT_FOLDER_TEMPLATE);
    expect(empty.fileNameTemplate).toBe(DEFAULT_NAME_TEMPLATE);
  });

  it('passes remote connection fields through, defaulting blanks', () => {
    const v = normalizeStorageConfig({
      storageBackend: 'ftp',
      remoteHost: 'nas.local',
      remotePort: 2121,
      remoteUser: 'achilleas',
      remotePass: 'secret',
      remoteShare: 'receipts',
      remoteBasePath: 'Pharos',
    });
    expect(v.remote).toMatchObject({
      host: 'nas.local',
      port: 2121,
      user: 'achilleas',
      pass: 'secret',
      share: 'receipts',
      basePath: 'Pharos',
    });
  });

  it('defaults remotePort to 0 when absent or falsy', () => {
    expect(normalizeStorageConfig({}).remote.port).toBe(0);
    expect(normalizeStorageConfig({ remotePort: 0 }).remote.port).toBe(0);
    expect(normalizeStorageConfig({ remotePort: 990 }).remote.port).toBe(990);
  });

  it('derives hasPass from a non-empty remotePass without exposing it separately', () => {
    expect(normalizeStorageConfig({ remotePass: 'pw' }).hasPass).toBe(true);
    expect(normalizeStorageConfig({ remotePass: '' }).hasPass).toBe(false);
    expect(normalizeStorageConfig({}).hasPass).toBe(false);
    // pass still lives in remote (server-only consumers need it), hasPass mirrors its presence
    expect(normalizeStorageConfig({ remotePass: 'pw' }).remote.pass).toBe('pw');
  });
});

// P99 — the optional second remote mirror.
describe('normalizeMirror2 / second destination', () => {
  it('is null when not configured', () => {
    expect(normalizeStorageConfig({}).mirror2).toBeNull();
    expect(normalizeStorageConfig({ storageMirror2: { backend: '' } }).mirror2).toBeNull();
  });

  it('is null when a backend is set but no host', () => {
    expect(normalizeStorageConfig({ storageMirror2: { backend: 'smb', host: '' } }).mirror2).toBeNull();
  });

  it('parses a valid SMB second destination into a RemoteConfig', () => {
    const s = normalizeStorageConfig({
      storageBackend: 'onedrive',
      storageMirror2: { backend: 'smb', host: 'nas.local', port: 445, user: 'me', pass: 'pw', share: 'backup', basePath: 'Pharos', secure: false },
    });
    expect(s.backend).toBe('onedrive'); // primary untouched
    expect(s.mirror2).toEqual({ backend: 'smb', host: 'nas.local', port: 445, user: 'me', pass: 'pw', share: 'backup', basePath: 'Pharos', secure: false });
    expect(s.hasPass2).toBe(true);
  });

  it('ignores an invalid backend value', () => {
    expect(normalizeStorageConfig({ storageMirror2: { backend: 'onedrive', host: 'x' } as never }).mirror2).toBeNull();
  });

  it('hasPass2 is false when no password is stored', () => {
    expect(normalizeStorageConfig({ storageMirror2: { backend: 'ftp', host: 'h' } }).hasPass2).toBe(false);
  });
});
