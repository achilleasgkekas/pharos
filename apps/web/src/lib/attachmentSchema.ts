import { Schema } from 'mongoose';

/**
 * A file or a link kept on a record: a manual PDF, a warranty card photo, the contract of a
 * subscription, the page of a product's manual online. Shared by items (P21), documents,
 * bills, subscriptions and tasks.
 *
 * Exactly one of `path` (a storage-relative file) and `url` (an http(s) link) is set. Items
 * saved before links existed only ever carry `path`.
 */
export const AttachmentSchema = new Schema(
  {
    path: { type: String, default: '' },
    url: { type: String, default: '' },
    name: { type: String, default: '' },
    mimeType: { type: String, default: '' },
    size: { type: Number, default: 0 },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);
