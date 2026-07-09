import { Schema, model, models, type Model, type InferSchemaType } from 'mongoose';

/**
 * One net-worth data point per calendar month (PA2). Captured idempotently on
 * /reports load: the CURRENT month's snapshot is refreshed on every visit, so once
 * a month rolls over its last captured value freezes into history. Forward-only by
 * design — no backfill (a month never visited simply has no point).
 *
 * assets = owned-inventory value + manual asset accounts (Settings → Money)
 * liabilities = remaining installments + outstanding card balances
 */
const NetWorthSnapshotSchema = new Schema(
  {
    period: { type: String, required: true, unique: true }, // YYYY-MM
    capturedAt: { type: Date, required: true },
    assetsInventory: { type: Number, default: 0 },
    assetsAccounts: { type: Number, default: 0 },
    // Copy of the manual accounts at capture time (name → balance), for tooltips/audit.
    accounts: { type: Schema.Types.Mixed, default: {} },
    liabInstallments: { type: Number, default: 0 },
    liabCards: { type: Number, default: 0 },
    net: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export type NetWorthSnapshotDoc = InferSchemaType<typeof NetWorthSnapshotSchema> & { _id: string };

export const NetWorthSnapshot: Model<NetWorthSnapshotDoc> =
  (models.NetWorthSnapshot as Model<NetWorthSnapshotDoc>) ||
  model<NetWorthSnapshotDoc>('NetWorthSnapshot', NetWorthSnapshotSchema);
