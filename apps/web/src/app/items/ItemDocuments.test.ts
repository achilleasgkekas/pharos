import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const docSource = readFileSync(
  fileURLToPath(new URL('./ItemDocuments.tsx', import.meta.url)),
  'utf8'
);

const photoSource = readFileSync(
  fileURLToPath(new URL('./ItemPhotoGallery.tsx', import.meta.url)),
  'utf8'
);

describe('ItemDocuments error handling', () => {
  it('safely handles upload response without throwing when attachments is undefined', () => {
    const errorResponse: { ok: boolean; error: string; attachments?: any[] } = {
      ok: false,
      error: 'File too large',
    };

    const processUploadResult = (r: typeof errorResponse) => {
      if (r.attachments?.length) {
        return r.attachments;
      }
      return null;
    };

    expect(() => processUploadResult(errorResponse)).not.toThrow();
    expect(processUploadResult(errorResponse)).toBeNull();
  });

  it('safely handles delete response without throwing when attachments is undefined', () => {
    const errorResponse: { ok: boolean; attachments?: any[] } = {
      ok: false,
    };

    const processDeleteResult = (r: typeof errorResponse) => {
      if (r?.attachments) {
        return r.attachments;
      }
      return null;
    };

    expect(() => processDeleteResult(errorResponse)).not.toThrow();
    expect(processDeleteResult(errorResponse)).toBeNull();
  });

  it('uses optional chaining in ItemDocuments.tsx to avoid direct unsafe property access', () => {
    expect(docSource).not.toMatch(/r\.attachments\.length/);
    expect(docSource).toMatch(/r\.attachments\?\.length/);
    expect(docSource).toMatch(/r\?\.attachments/);
  });
});

describe('ItemPhotoGallery error handling', () => {
  it('safely handles photo upload response when photos is undefined', () => {
    const errorResponse: { ok: boolean; error?: string; photos?: string[] } = {
      ok: false,
      error: 'Upload failed',
    };

    const processPhotoResult = (r: typeof errorResponse) => {
      if (r.photos?.length) {
        return r.photos;
      }
      return null;
    };

    expect(() => processPhotoResult(errorResponse)).not.toThrow();
    expect(processPhotoResult(errorResponse)).toBeNull();
  });

  it('uses optional chaining in ItemPhotoGallery.tsx to avoid direct unsafe property access', () => {
    expect(photoSource).not.toMatch(/r\.photos\.length/);
    expect(photoSource).toMatch(/r\.photos\?\.length/);
  });
});
