/**
 * Personal-document expiry logic (P42), kept pure and DB-free so the rules are pinned by
 * tests. Mirrors lib/bill.ts's due-date idiom: whole-day countdown, overdue = negative,
 * and the alert set is "expiring within the lead window, plus anything already expired
 * (nag until renewed)", soonest first.
 */

const DAY_MS = 86400000;

/** Whole days until a document expires: 0 = today, negative = already expired, null when
 *  the date is missing or unparseable. Compared at day granularity (both floored to UTC
 *  midnight) so "expires today" is 0 regardless of the time of day. */
export function documentDaysUntilExpiry(expiry: string | Date | null | undefined, now: number = Date.now()): number | null {
  if (!expiry) return null;
  const d = new Date(expiry);
  if (isNaN(d.getTime())) return null;
  const floor = (t: number) => Math.floor(t / DAY_MS);
  return floor(d.getTime()) - floor(now);
}

export type DocStatus = 'expired' | 'soon' | 'ok';

/** UI badge state for a document, given the alert lead window. */
export function documentStatus(days: number | null, leadDays: number): DocStatus {
  if (days === null) return 'ok';
  if (days < 0) return 'expired';
  if (days <= leadDays) return 'soon';
  return 'ok';
}

export type ExpiringDocRow = { _id: unknown; title: string; type?: string; holder?: string; expiryDate?: string | Date | null };
export type ExpiringDoc = { _id: unknown; title: string; type: string; holder: string; days: number; iso: string };

/**
 * Documents that warrant an alert: expiring within `leadDays`, OR already expired (overdue
 * nag). `leadDays <= 0` turns the check off (returns nothing), same convention as the other
 * alert windows. Soonest/most-overdue first.
 */
export function collectExpiringDocuments(rows: ExpiringDocRow[], leadDays: number, now: number = Date.now()): ExpiringDoc[] {
  if (!(leadDays > 0)) return [];
  const out: ExpiringDoc[] = [];
  for (const r of rows) {
    const days = documentDaysUntilExpiry(r.expiryDate ?? null, now);
    if (days === null || days > leadDays) continue;
    out.push({
      _id: r._id,
      title: r.title,
      type: r.type || '',
      holder: r.holder || '',
      days,
      iso: r.expiryDate ? new Date(r.expiryDate).toISOString().slice(0, 10) : '',
    });
  }
  return out.sort((a, b) => a.days - b.days);
}
