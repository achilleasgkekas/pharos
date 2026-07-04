import { describe, it, expect } from 'vitest';
import { shortId, extOf, baseNoExt, remoteRelPath } from './mirror';
import { DEFAULT_FOLDER_TEMPLATE, DEFAULT_NAME_TEMPLATE } from './storagePath';

// These pure helpers derive the remote-relative path a locally-stored file mirrors to.
// The invariant they guard: upload, download, and share-link all call remoteRelPath with
// the same MirrorMeta + templates, so they must resolve to byte-identical paths. If any
// of shortId/extOf/baseNoExt drifts, a mirrored file becomes unreachable on the remote.

describe('shortId', () => {
  it('keeps the last 8 chars of a 24-hex Mongo _id', () => {
    expect(shortId('507f1f77bcf86cd799439011')).toBe('99439011');
  });

  it('returns short values whole (fewer than 8 chars)', () => {
    expect(shortId('abc')).toBe('abc');
    expect(shortId('')).toBe('');
  });

  it('coerces null/undefined to empty string (no "null"/"undefined" leaking into paths)', () => {
    expect(shortId(null)).toBe('');
    expect(shortId(undefined)).toBe('');
  });

  it('stringifies non-string ids (number, ObjectId-like) then takes last 8', () => {
    expect(shortId(123456789)).toBe('23456789');
    // Mongo ObjectId stringifies to hex via toString()
    expect(shortId({ toString: () => '65a1b2c3d4e5f60718293a4b' })).toBe('18293a4b');
  });
});

describe('extOf', () => {
  it('lower-cases the extension and drops the dot', () => {
    expect(extOf('receipt.PDF')).toBe('pdf');
    expect(extOf('photo.JPEG')).toBe('jpeg');
  });

  it('takes only the final extension of a multi-dot name', () => {
    expect(extOf('archive.tar.gz')).toBe('gz');
  });

  it('ignores directory segments when reading the extension', () => {
    expect(extOf('receipts/2026/06/scan.png')).toBe('png');
  });

  it('falls back to "bin" when there is no extension', () => {
    expect(extOf('noext')).toBe('bin');
    expect(extOf('trailingdot.')).toBe('bin');
    expect(extOf('')).toBe('bin');
  });

  it('accepts alphanumeric extensions like 7z', () => {
    expect(extOf('backup.7z')).toBe('7z');
  });
});

describe('baseNoExt', () => {
  it('returns the filename without its extension', () => {
    expect(baseNoExt('plain.txt')).toBe('plain');
  });

  it('strips only the final extension of a multi-dot name', () => {
    expect(baseNoExt('a.tar.gz')).toBe('a.tar');
  });

  it('drops directory segments, keeping just the base name', () => {
    expect(baseNoExt('receipts/2026/06/a1b2.pdf')).toBe('a1b2');
    expect(baseNoExt('/leading/slash/x.pdf')).toBe('x');
  });

  it('returns the name unchanged when it has no extension', () => {
    expect(baseNoExt('noext')).toBe('noext');
  });

  it('handles an empty path without throwing', () => {
    expect(baseNoExt('')).toBe('');
  });
});

describe('remoteRelPath', () => {
  const templates = { folderTemplate: DEFAULT_FOLDER_TEMPLATE, fileNameTemplate: DEFAULT_NAME_TEMPLATE };

  it('renders the default receipts path from full metadata', () => {
    const out = remoteRelPath(templates, {
      kind: 'receipts',
      store: 'Skroutz',
      date: '2026-06-04',
      total: 129.98,
      id: '507f1f77bcf86cd799439011',
    }, 'receipts/2026/06/whatever.pdf');
    expect(out).toBe('receipts/2026/06/2026-06-04_Skroutz_99439011.pdf');
  });

  it('accepts a Date object for the date and slices it to YYYY-MM-DD', () => {
    const out = remoteRelPath(templates, {
      kind: 'statements',
      store: 'Mastercard',
      date: new Date('2026-01-15T00:00:00.000Z'),
      id: 'abcdef0123456789',
    }, 'x.pdf');
    expect(out).toBe('statements/2026/01/2026-01-15_Mastercard_23456789.pdf');
  });

  it('collapses empty date tokens so the year/month folders and leading separators vanish', () => {
    const out = remoteRelPath(templates, {
      kind: 'receipts',
      store: 'Skroutz',
      id: '507f1f77bcf86cd799439011',
    }, 'file.pdf');
    // No date → no {year}/{month} folder segments, and the leading '_' from the empty
    // {date} token is trimmed away by renderStoragePath.
    expect(out).toBe('receipts/Skroutz_99439011.pdf');
  });

  it('derives the extension from the local file path, not the template', () => {
    const out = remoteRelPath(templates, {
      kind: 'expenses',
      store: 'DEH',
      date: '2026-03-01',
      id: 'zzzz1111',
    }, 'expenses/2026/03/bill.PNG');
    expect(out.endsWith('.png')).toBe(true);
  });

  it('honours custom folder/name templates and the {original}/{ext} tokens', () => {
    const out = remoteRelPath(
      { folderTemplate: '{kind}/{store}', fileNameTemplate: '{original}_{id}' },
      { kind: 'receipts', store: 'Public', date: '2026-06-04', id: 'deadbeef99887766' },
      'inbox/my-receipt.jpg'
    );
    expect(out).toBe('receipts/Public/my-receipt_99887766.jpg');
  });
});
