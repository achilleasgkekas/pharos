import { describe, expect, it } from 'vitest';
import type { SerializedAttachment, SerializedItem } from '@/types';
import { applyItemPatch } from './itemPatch';

// The modal's children are keyed by updatedAt, so "does this remount?" is the same
// question as "did updatedAt change?". These tests replay the #245 sequence at the
// state-transition level: the repo has no DOM test environment (vitest runs in node).

const pdf: SerializedAttachment = {
  path: 'items/1/manual.pdf',
  name: 'manual.pdf',
  mimeType: 'application/pdf',
  size: 1024,
  uploadedAt: '2026-09-21T08:00:00.000Z',
};

// Only the fields the patch touches matter; the cast keeps the fixture readable.
const item = {
  _id: 'item1',
  title: 'Dishwasher',
  photos: [],
  attachments: [],
  updatedAt: '2026-09-01T00:00:00.000Z',
} as unknown as SerializedItem;

describe('applyItemPatch (#245)', () => {
  it('the old photo-fetch transition dropped a freshly uploaded document', () => {
    // What ItemDetail used to do: the vault kept the PDF in its own state only, and the
    // fetch spread the item it had captured, which never learned about the upload.
    const captured = item;
    const afterFetch = { ...captured, photos: ['p1.jpg'], updatedAt: '2026-09-21T09:00:00.000Z' };
    expect(afterFetch.attachments).toEqual([]); // the remounted vault re-seeds from this
  });

  it('keeps an uploaded document through a later photo fetch', () => {
    let cur: SerializedItem | null = item;
    cur = applyItemPatch(cur, { attachments: [pdf] }); // vault reports its upload
    cur = applyItemPatch(cur, { photos: ['p1.jpg'] }, { rekey: true, now: new Date('2026-09-21T09:00:00Z') });
    expect(cur?.attachments).toEqual([pdf]);
    expect(cur?.photos).toEqual(['p1.jpg']);
  });

  it('keeps an uploaded photo through a later document upload', () => {
    let cur: SerializedItem | null = item;
    cur = applyItemPatch(cur, { photos: ['mine.jpg'] }); // gallery reports its upload
    cur = applyItemPatch(cur, { attachments: [pdf] });
    expect(cur?.photos).toEqual(['mine.jpg']);
  });

  it('does not remount the child that reported its own change', () => {
    const next = applyItemPatch(item, { attachments: [pdf] });
    expect(next?.updatedAt).toBe(item.updatedAt);
  });

  it('remounts on rekey so the gallery shows photos fetched from outside it', () => {
    const next = applyItemPatch(item, { photos: ['p1.jpg'] }, { rekey: true, now: new Date('2026-09-21T09:00:00Z') });
    expect(next?.updatedAt).toBe('2026-09-21T09:00:00.000Z');
  });

  it('leaves the other fields and the input untouched', () => {
    const next = applyItemPatch(item, { photos: ['p1.jpg'] });
    expect(next?.title).toBe('Dishwasher');
    expect(item.photos).toEqual([]);
  });

  it('is a no-op once the modal has closed', () => {
    expect(applyItemPatch(null, { photos: ['p1.jpg'] })).toBeNull();
  });
});
