import { iso } from '@/lib/apiList';

// Shared receipt serializer. Lives outside the route files because Next.js only
// allows route-handler exports (GET/POST/…) from a route.ts.
export type ReceiptLean = {
  _id: unknown; store: string; date?: Date; total?: number; subtotal?: number; vatAmount?: number;
  currency?: string; origAmount?: number; fxRate?: number;
  paymentMethod?: string; warrantyMonths?: number; space?: string; verified?: boolean; archived?: boolean;
  lineItems?: unknown[]; filePath?: string; thumbPath?: string; updatedAt?: Date; deletedAt?: Date | null;
};

// Stored line-item shape (as persisted on the Receipt) and the normalized API shape.
type LineLean = { name?: string; refinedName?: string; qty?: number; price?: number; vatRate?: number; category?: string };
export type ReceiptLine = { name: string; qty: number; price: number; vatRate: number; category: string };

/**
 * Normalize stored receipt line items into the API shape. `refinedName` (AI-cleaned)
 * wins over the raw `name`; `price` is the stored unit NET. Shared by the receipt
 * detail GET, the rescan POST, and the scan/receipt POST so all three return an
 * identical lineItems shape.
 */
export function serializeLineItems(lines: unknown): ReceiptLine[] {
  return ((lines ?? []) as LineLean[]).map((l) => ({
    name: l.refinedName || l.name || '',
    qty: l.qty ?? 1,
    price: l.price ?? 0,
    vatRate: l.vatRate ?? 0,
    category: l.category ?? '', // P64: '' = untagged
  }));
}

// `returnDaysLeft` (PA3 return-window, optional) is a cross-doc computation — it
// needs the store list + app settings — so it's passed in by the route, same
// pattern as the expenses `anomaly` field.
export function trimReceipt(r: ReceiptLean, returnDaysLeft?: number) {
  return {
    id: String(r._id),
    store: r.store,
    date: iso(r.date),
    total: r.total ?? 0,
    subtotal: r.subtotal ?? 0,
    vatAmount: r.vatAmount ?? 0,
    currency: r.currency ?? 'EUR',
    // Multi-currency (P9): `total` is always base currency; these describe the printed
    // side of a foreign receipt (0/0 for an ordinary one). See API.md.
    origAmount: r.origAmount ?? 0,
    fxRate: r.fxRate ?? 0,
    paymentMethod: r.paymentMethod ?? '',
    warrantyMonths: r.warrantyMonths ?? 0,
    space: r.space ?? '', // P68: per-property ledger tag; '' = unassigned
    itemCount: r.lineItems?.length ?? 0,
    verified: !!r.verified,
    archived: !!r.archived,
    file: r.filePath || null, // fetch via GET /api/files/<file> with the same Bearer token
    thumb: r.thumbPath || null,
    updatedAt: iso(r.updatedAt),
    deleted: !!r.deletedAt,
    ...(returnDaysLeft !== undefined ? { returnDaysLeft } : {}),
  };
}
