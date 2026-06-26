import { iso } from '@/lib/apiList';

// Shared receipt serializer. Lives outside the route files because Next.js only
// allows route-handler exports (GET/POST/…) from a route.ts.
export type ReceiptLean = {
  _id: unknown; store: string; date?: Date; total?: number; subtotal?: number; vatAmount?: number;
  currency?: string; paymentMethod?: string; warrantyMonths?: number; verified?: boolean; archived?: boolean;
  lineItems?: unknown[]; filePath?: string; thumbPath?: string; updatedAt?: Date; deletedAt?: Date | null;
};

export function trimReceipt(r: ReceiptLean) {
  return {
    id: String(r._id),
    store: r.store,
    date: iso(r.date),
    total: r.total ?? 0,
    subtotal: r.subtotal ?? 0,
    vatAmount: r.vatAmount ?? 0,
    currency: r.currency ?? 'EUR',
    paymentMethod: r.paymentMethod ?? '',
    warrantyMonths: r.warrantyMonths ?? 0,
    itemCount: r.lineItems?.length ?? 0,
    verified: !!r.verified,
    archived: !!r.archived,
    file: r.filePath || null, // fetch via GET /api/files/<file> with the same Bearer token
    thumb: r.thumbPath || null,
    updatedAt: iso(r.updatedAt),
    deleted: !!r.deletedAt,
  };
}
