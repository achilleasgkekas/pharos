// Net-worth time-series helpers (PA2). The reports page already computes every
// input (owned-inventory value, remaining installments, card balances, and the
// manual asset accounts from settings); this module turns them into a monthly
// snapshot series. Capture is idempotent and forward-only: the current month is
// upserted on every /reports load, past months stay frozen, and there is no
// backfill — history builds from the first visit onward.
import { NetWorthSnapshot as NetWorthSnapshotModel } from '@/models/NetWorthSnapshot';
import { currentModel } from '@/lib/tenancy/connection';

export type NetWorthBreakdown = {
  assetsInventory: number;
  assetsAccounts: number;
  accounts: Record<string, number>; // manual accounts (name → balance) at capture time
  liabInstallments: number;
  liabCards: number;
};

export type NetWorthPoint = {
  period: string; // YYYY-MM
  assetsInventory: number;
  assetsAccounts: number;
  liabInstallments: number;
  liabCards: number;
  net: number;
};

/** assets − liabilities, rounded to whole units (the reports page shows integers). */
export function netWorthOf(b: NetWorthBreakdown): number {
  return Math.round(b.assetsInventory + b.assetsAccounts - b.liabInstallments - b.liabCards);
}

export function currentPeriod(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/** Upsert this month's snapshot with fresh values, then return the full series
 *  (ascending by period) for the trend chart. Never throws — a snapshot failure
 *  must not break the reports page. */
export async function captureAndListSnapshots(b: NetWorthBreakdown): Promise<NetWorthPoint[]> {
  try {
    const Snapshot = await currentModel(NetWorthSnapshotModel);
    const net = netWorthOf(b);
    await Snapshot.updateOne(
      { period: currentPeriod() },
      {
        $set: {
          capturedAt: new Date(),
          assetsInventory: Math.round(b.assetsInventory),
          assetsAccounts: Math.round(b.assetsAccounts),
          accounts: b.accounts,
          liabInstallments: Math.round(b.liabInstallments),
          liabCards: Math.round(b.liabCards),
          net,
        },
      },
      { upsert: true }
    );
    const docs = await Snapshot.find()
      .select('period assetsInventory assetsAccounts liabInstallments liabCards net')
      .sort({ period: 1 })
      .lean();
    return docs.map((d) => ({
      period: d.period,
      assetsInventory: d.assetsInventory || 0,
      assetsAccounts: d.assetsAccounts || 0,
      liabInstallments: d.liabInstallments || 0,
      liabCards: d.liabCards || 0,
      net: d.net || 0,
    }));
  } catch {
    return [];
  }
}
