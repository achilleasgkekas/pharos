import { describe, it, expect, vi, beforeEach } from 'vitest';

// app/items/actions.ts is a large multi-concern module (see actions.crud.test.ts's header
// for the full concern list). This file covers the PHOTO + DOCUMENT-ATTACHMENT slice:
// uploadItemPhotos / deleteItemPhoto / setItemCover / uploadItemAttachments /
// deleteItemAttachment. All five are storage-mock-heavy (saveFile/deleteFile) and touch no
// AI/web-fetch code, mirroring the receipts upload tests' file-mocking idiom.
//
// Behaviour pinned:
//  - uploadItemPhotos: silently SKIPS any file whose extension isn't in IMAGE_EXTS (no
//    error thrown, no save for it) — the surrounding batch still saves the valid ones. A
//    dot-less filename (e.g. "noext") is treated as its OWN extension by `.split('.').pop()`
//    and gets skipped just like any other unrecognized one; only a genuinely EMPTY name
//    (`''.split('.').pop()` -> `''`, falsy) falls back to 'jpg' via the `|| 'jpg'` default.
//  - deleteItemPhoto/setItemCover/uploadItemAttachments/deleteItemAttachment all no-op
//    (ok:false, unchanged array) when the item isn't found OR the target path/entry isn't
//    present — they never throw.
//  - deleteItemPhoto/deleteItemAttachment call deleteFile() but SWALLOW its rejection (the
//    doc is already updated+saved regardless — "file already gone" is not a failure).
//  - setItemCover always prepends the given path to the front of `photos`, filtering out
//    any existing occurrence first (so a path already at the front is a no-op reorder, and
//    a path elsewhere in the list moves to the front without duplicating).
//  - uploadItemAttachments maps extension -> mimeType via the fixed DOC_MIME table
//    (falling back to 'application/octet-stream' for an unmapped-but-allowed ext, though in
//    practice every DOC_EXTS entry has a DOC_MIME row), truncates `name` to 200 chars, and
//    calls `item.markModified('attachments')` before saving (plain-array push wouldn't
//    otherwise be tracked by Mongoose on a Mixed/subdoc array in some schemas).

const { connectDBMock, itemFindById, saveFileMock, deleteFileMock, revalidatePathMock } = vi.hoisted(() => ({
  connectDBMock: vi.fn(async () => {}),
  itemFindById: vi.fn(async (_id: string) => null as any),
  saveFileMock: vi.fn(async (_bucket: string, _bytes: Buffer, ext: string) => ({ relativePath: `equipment/2026/07/file.${ext}` })),
  deleteFileMock: vi.fn(async (_path: string) => {}),
  revalidatePathMock: vi.fn(),
}));

const itemModel = { findById: itemFindById };

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/lib/tenancy/request', () => ({ withRequestTenant: async (fn: () => Promise<any>) => fn() }));
vi.mock('@/lib/tenancy/connection', () => ({ currentModel: async () => itemModel }));
vi.mock('@/models/Item', () => ({ Item: {} }));
vi.mock('@/models/Receipt', () => ({ Receipt: {} }));
vi.mock('@/models/Statement', () => ({ Statement: {} }));
vi.mock('@/models/Task', () => ({ Task: {} }));
vi.mock('@/lib/scrape', () => ({ fetchPageText: vi.fn() }));
vi.mock('@/lib/ollama', () => ({ parseProductFromPage: vi.fn() }));
vi.mock('@/lib/aiFeatures.server', () => ({ isFeatureEnabled: vi.fn(async () => true) }));
vi.mock('@/lib/search', () => ({ searchWeb: vi.fn(), searchImages: vi.fn() }));
vi.mock('@/lib/storage', () => ({ saveFile: saveFileMock, deleteFile: deleteFileMock }));
vi.mock('@/lib/ssrf', () => ({ assertPublicUrl: vi.fn(async () => {}) }));
vi.mock('@/lib/revalidate', () => ({ safeRevalidate: vi.fn() }));
vi.mock('@/lib/appSettings', () => ({ getAppSettings: vi.fn(async () => ({ currency: 'EUR' })) }));
vi.mock('next/cache', () => ({ revalidatePath: (p: string) => revalidatePathMock(p) }));

import { uploadItemPhotos, deleteItemPhoto, setItemCover, uploadItemAttachments, deleteItemAttachment } from './actions';

function makeFile(name: string, bytes = 'x', type = 'image/jpeg'): File {
  return new File([new Blob([bytes], { type })], name, { type });
}

function makeItem(overrides: Record<string, any> = {}) {
  return {
    photos: [] as string[],
    attachments: [] as any[],
    save: vi.fn(async () => {}),
    markModified: vi.fn(),
    ...overrides,
  };
}

function fdWithFiles(files: File[]): FormData {
  const fd = new FormData();
  for (const f of files) fd.append('files', f);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  itemFindById.mockResolvedValue(null);
});

describe('uploadItemPhotos', () => {
  it('errors when no files are attached, without touching the DB', async () => {
    const r = await uploadItemPhotos('i1', new FormData());
    expect(r).toEqual({ ok: false, added: 0, photos: [], error: 'No image found' });
    expect(connectDBMock).not.toHaveBeenCalled();
  });

  it('errors when the item is not found', async () => {
    itemFindById.mockResolvedValue(null);
    const r = await uploadItemPhotos('i1', fdWithFiles([makeFile('a.jpg')]));
    expect(r).toEqual({ ok: false, added: 0, photos: [], error: 'Item not found' });
  });

  it('saves a valid image, pushes its path, and revalidates both list pages', async () => {
    const item = makeItem();
    itemFindById.mockResolvedValue(item);
    const r = await uploadItemPhotos('i1', fdWithFiles([makeFile('photo.PNG')]));
    expect(saveFileMock).toHaveBeenCalledWith('equipment', expect.any(Buffer), 'png');
    expect(item.photos).toEqual(['equipment/2026/07/file.png']);
    expect(item.save).toHaveBeenCalledTimes(1);
    expect(r).toEqual({ ok: true, added: 1, photos: ['equipment/2026/07/file.png'], error: undefined });
    expect(revalidatePathMock).toHaveBeenCalledWith('/items');
    expect(revalidatePathMock).toHaveBeenCalledWith('/shopping');
  });

  it('silently skips an unsupported extension and never saves the doc', async () => {
    const item = makeItem();
    itemFindById.mockResolvedValue(item);
    const r = await uploadItemPhotos('i1', fdWithFiles([makeFile('malware.exe')]));
    expect(saveFileMock).not.toHaveBeenCalled();
    expect(item.save).not.toHaveBeenCalled();
    expect(r).toEqual({ ok: false, added: 0, photos: [], error: 'Unsupported image type' });
  });

  it('processes a mixed batch, counting only the accepted files', async () => {
    const item = makeItem();
    itemFindById.mockResolvedValue(item);
    const r = await uploadItemPhotos('i1', fdWithFiles([makeFile('a.jpg'), makeFile('b.exe'), makeFile('c.webp')]));
    expect(r.ok).toBe(true);
    expect(r.added).toBe(2);
    expect(item.photos).toHaveLength(2);
    expect(item.save).toHaveBeenCalledTimes(1);
  });

  it('skips a dot-less filename (its whole name is read as the extension)', async () => {
    const item = makeItem();
    itemFindById.mockResolvedValue(item);
    const r = await uploadItemPhotos('i1', fdWithFiles([makeFile('noext')]));
    expect(saveFileMock).not.toHaveBeenCalled();
    expect(r).toEqual({ ok: false, added: 0, photos: [], error: 'Unsupported image type' });
  });

  it('defaults a genuinely empty filename to jpg (passes the image check)', async () => {
    const item = makeItem();
    itemFindById.mockResolvedValue(item);
    await uploadItemPhotos('i1', fdWithFiles([makeFile('')]));
    expect(saveFileMock).toHaveBeenCalledWith('equipment', expect.any(Buffer), 'jpg');
  });

  it('ignores empty (size 0) file entries in the FormData', async () => {
    const empty = makeFile('empty.jpg', '');
    Object.defineProperty(empty, 'size', { value: 0 });
    const r = await uploadItemPhotos('i1', fdWithFiles([empty]));
    expect(r).toEqual({ ok: false, added: 0, photos: [], error: 'No image found' });
  });
});

describe('deleteItemPhoto', () => {
  it('no-ops when the item is not found', async () => {
    itemFindById.mockResolvedValue(null);
    const r = await deleteItemPhoto('i1', 'equipment/a.jpg');
    expect(r).toEqual({ ok: false, photos: [] });
  });

  it('no-ops when the path is not among the photos', async () => {
    const item = makeItem({ photos: ['equipment/a.jpg'] });
    itemFindById.mockResolvedValue(item);
    const r = await deleteItemPhoto('i1', 'equipment/other.jpg');
    expect(r).toEqual({ ok: false, photos: ['equipment/a.jpg'] });
    expect(item.save).not.toHaveBeenCalled();
  });

  it('removes the path, saves, deletes the file, and revalidates', async () => {
    const item = makeItem({ photos: ['equipment/a.jpg', 'equipment/b.jpg'] });
    itemFindById.mockResolvedValue(item);
    const r = await deleteItemPhoto('i1', 'equipment/a.jpg');
    expect(item.photos).toEqual(['equipment/b.jpg']);
    expect(item.save).toHaveBeenCalledTimes(1);
    expect(deleteFileMock).toHaveBeenCalledWith('equipment/a.jpg');
    expect(r).toEqual({ ok: true, photos: ['equipment/b.jpg'] });
    expect(revalidatePathMock).toHaveBeenCalledWith('/items');
    expect(revalidatePathMock).toHaveBeenCalledWith('/shopping');
  });

  it('still reports success when deleteFile rejects (file already gone)', async () => {
    const item = makeItem({ photos: ['equipment/a.jpg'] });
    itemFindById.mockResolvedValue(item);
    deleteFileMock.mockRejectedValueOnce(new Error('ENOENT'));
    const r = await deleteItemPhoto('i1', 'equipment/a.jpg');
    expect(r).toEqual({ ok: true, photos: [] });
  });
});

describe('setItemCover', () => {
  it('no-ops when the item is not found', async () => {
    itemFindById.mockResolvedValue(null);
    const r = await setItemCover('i1', 'equipment/b.jpg');
    expect(r).toEqual({ ok: false, photos: [] });
  });

  it('moves an existing photo to the front without duplicating it', async () => {
    const item = makeItem({ photos: ['equipment/a.jpg', 'equipment/b.jpg', 'equipment/c.jpg'] });
    itemFindById.mockResolvedValue(item);
    const r = await setItemCover('i1', 'equipment/b.jpg');
    expect(item.photos).toEqual(['equipment/b.jpg', 'equipment/a.jpg', 'equipment/c.jpg']);
    expect(item.save).toHaveBeenCalledTimes(1);
    expect(r).toEqual({ ok: true, photos: ['equipment/b.jpg', 'equipment/a.jpg', 'equipment/c.jpg'] });
  });

  it('is a no-op reorder when the photo is already at the front', async () => {
    const item = makeItem({ photos: ['equipment/a.jpg', 'equipment/b.jpg'] });
    itemFindById.mockResolvedValue(item);
    await setItemCover('i1', 'equipment/a.jpg');
    expect(item.photos).toEqual(['equipment/a.jpg', 'equipment/b.jpg']);
  });
});

describe('uploadItemAttachments', () => {
  it('errors when no files are attached, without touching the DB', async () => {
    const r = await uploadItemAttachments('i1', new FormData());
    expect(r).toEqual({ ok: false, added: 0, attachments: [], error: 'No file selected' });
    expect(connectDBMock).not.toHaveBeenCalled();
  });

  it('errors when the item is not found', async () => {
    itemFindById.mockResolvedValue(null);
    const r = await uploadItemAttachments('i1', fdWithFiles([makeFile('manual.pdf', 'x', 'application/pdf')]));
    expect(r).toEqual({ ok: false, added: 0, attachments: [], error: 'Item not found' });
  });

  it('saves a valid document with the mapped mimeType and truncated name', async () => {
    const item = makeItem();
    itemFindById.mockResolvedValue(item);
    const longName = `${'a'.repeat(250)}.pdf`;
    const r = await uploadItemAttachments('i1', fdWithFiles([makeFile(longName, 'x', 'application/pdf')]));
    expect(saveFileMock).toHaveBeenCalledWith('equipment', expect.any(Buffer), 'pdf');
    expect(item.attachments).toHaveLength(1);
    expect(item.attachments[0].path).toBe('equipment/2026/07/file.pdf');
    expect(item.attachments[0].name).toHaveLength(200);
    expect(item.attachments[0].mimeType).toBe('application/pdf');
    expect(item.attachments[0].uploadedAt).toBeInstanceOf(Date);
    expect(item.markModified).toHaveBeenCalledWith('attachments');
    expect(item.save).toHaveBeenCalledTimes(1);
    expect(r.ok).toBe(true);
    expect(r.added).toBe(1);
  });

  it('silently skips an unsupported extension', async () => {
    const item = makeItem();
    itemFindById.mockResolvedValue(item);
    const r = await uploadItemAttachments('i1', fdWithFiles([makeFile('data.zip', 'x', 'application/zip')]));
    expect(saveFileMock).not.toHaveBeenCalled();
    expect(item.save).not.toHaveBeenCalled();
    expect(r).toEqual({ ok: false, added: 0, attachments: [], error: 'Unsupported file type' });
  });

  it('maps every DOC_EXTS extension to its DOC_MIME entry', async () => {
    const item = makeItem();
    itemFindById.mockResolvedValue(item);
    await uploadItemAttachments(
      'i1',
      fdWithFiles([
        makeFile('a.docx', 'x', 'application/octet-stream'),
        makeFile('b.txt', 'x', 'text/plain'),
      ])
    );
    expect(item.attachments[0].mimeType).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    expect(item.attachments[1].mimeType).toBe('text/plain');
  });
});

describe('deleteItemAttachment', () => {
  it('no-ops when the item is not found', async () => {
    itemFindById.mockResolvedValue(null);
    const r = await deleteItemAttachment('i1', 'equipment/manual.pdf');
    expect(r).toEqual({ ok: false, attachments: [] });
  });

  it('no-ops when the path is not among the attachments', async () => {
    const item = makeItem({ attachments: [{ path: 'equipment/a.pdf', name: 'a.pdf' }] });
    itemFindById.mockResolvedValue(item);
    const r = await deleteItemAttachment('i1', 'equipment/missing.pdf');
    expect(r).toEqual({ ok: false, attachments: [{ path: 'equipment/a.pdf', name: 'a.pdf' }] });
    expect(item.save).not.toHaveBeenCalled();
  });

  it('removes the entry, saves, deletes the file, and revalidates', async () => {
    const item = makeItem({
      attachments: [
        { path: 'equipment/a.pdf', name: 'a.pdf' },
        { path: 'equipment/b.pdf', name: 'b.pdf' },
      ],
    });
    itemFindById.mockResolvedValue(item);
    const r = await deleteItemAttachment('i1', 'equipment/a.pdf');
    expect(item.attachments).toEqual([{ path: 'equipment/b.pdf', name: 'b.pdf' }]);
    expect(item.markModified).toHaveBeenCalledWith('attachments');
    expect(item.save).toHaveBeenCalledTimes(1);
    expect(deleteFileMock).toHaveBeenCalledWith('equipment/a.pdf');
    expect(r).toEqual({ ok: true, attachments: [{ path: 'equipment/b.pdf', name: 'b.pdf' }] });
    expect(revalidatePathMock).toHaveBeenCalledWith('/items');
    expect(revalidatePathMock).toHaveBeenCalledWith('/shopping');
  });

  it('still reports success when deleteFile rejects (file already gone)', async () => {
    const item = makeItem({ attachments: [{ path: 'equipment/a.pdf', name: 'a.pdf' }] });
    itemFindById.mockResolvedValue(item);
    deleteFileMock.mockRejectedValueOnce(new Error('ENOENT'));
    const r = await deleteItemAttachment('i1', 'equipment/a.pdf');
    expect(r).toEqual({ ok: true, attachments: [] });
  });
});
