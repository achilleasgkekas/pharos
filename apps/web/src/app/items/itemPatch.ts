import type { SerializedItem } from '@/types';

/**
 * Apply a partial change to the item the detail modal is showing (#245).
 *
 * The modal's gallery, document vault and form are keyed by `updatedAt`, so a new
 * `updatedAt` remounts them and they re-seed from whatever `item` the parent holds.
 * The photo vault and document vault used to keep uploads in their OWN state only,
 * and the photo fetch rebuilt the item from the modal's captured `item` — so a PDF
 * uploaded a moment earlier was missing from that copy and vanished on the remount.
 *
 * Two rules keep the parent the single source of truth:
 *  - Always merge onto the CURRENT item (callers pass this to a functional setState),
 *    never onto a copy captured when a handler started.
 *  - Only `rekey` when the change came from outside the child that shows it (the
 *    toolbar's photo fetch). A child reporting its own upload/delete must not remount
 *    itself: it already shows the new list, and a remount would reset its UI state.
 */
export function applyItemPatch(
  cur: SerializedItem | null,
  patch: Partial<Pick<SerializedItem, 'photos' | 'attachments'>>,
  opts: { rekey?: boolean; now?: Date } = {},
): SerializedItem | null {
  if (!cur) return cur;
  const next: SerializedItem = { ...cur, ...patch };
  if (opts.rekey) next.updatedAt = (opts.now ?? new Date()).toISOString();
  return next;
}
