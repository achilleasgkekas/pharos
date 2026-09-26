import { Schema, model, models, type Model, type InferSchemaType } from 'mongoose';
import { softDeletePlugin } from '@/lib/softDelete';
import { createdByPlugin } from '@/lib/createdBy';

// P28 — bill / payable status tracker (due → paid → overdue). Distinct from
// Subscription (an AUTOMATIC recurring charge) and from /calendar (which only
// PROJECTS the future): a Bill is something you pay by HAND (ΔΕΗ, ΟΤΕ, κοινόχρηστα)
// whose lifecycle we track — "is it due?, did I pay it?, was it forgotten → overdue".
// Status is DERIVED from dueDate + paidAt (see lib/bill.ts), never stored.
// P61 — one manual instalment toward a bill. `amount` is
// ALWAYS in the deployment's base currency, same denomination as `Bill.amount`, so
// "what is still owed" is plain subtraction even on a foreign-currency bill.
// `expenseId` is set when the opt-in "also log an expense" was ticked for THIS payment.
const BillPaymentSchema = new Schema(
  {
    amount: { type: Number, required: true },
    date: { type: Date, default: () => new Date() },
    note: { type: String, default: '' },
    expenseId: { type: String, default: '' },
  },
  { _id: true }
);

const BillSchema = new Schema(
  {
    title: { type: String, required: true }, // "ΔΕΗ ρεύμα", "Κοινόχρηστα Ιουλίου"
    vendor: { type: String, default: '', index: true }, // payee
    amount: { type: Number, required: true, default: 0 },
    // Multi-currency (P9): `amount` is ALWAYS denominated in the deployment's base currency,
    // so every roll-up that already sums it (the "to pay" header, /calendar's projected bills,
    // the expense a payment logs) keeps working untouched. A bill printed in another currency
    // additionally remembers what the paper says: `origAmount` is the printed figure and
    // `fxRate` the base units per 1 unit of `currency`. See lib/fx.ts.
    currency: { type: String, default: 'EUR' },
    origAmount: { type: Number, default: 0 },
    fxRate: { type: Number, default: 0 },
    dueDate: { type: Date, required: true, index: true },
    paidAt: { type: Date, default: null }, // null = still unpaid (or only partly paid, see `payments`)
    // P61: optional instalments. Empty array = the pre-P61 binary bill, unchanged in
    // every respect. Once the payments cover `amount`, paidAt is set automatically.
    payments: { type: [BillPaymentSchema], default: [] },
    category: { type: String, default: 'other' }, // reused when a payment logs an expense
    // '' = one-off. Otherwise a recurring template: paying it spawns the next
    // pending instance one cycle ahead (see markBillPaid).
    // Kept in sync with RECURRING_CYCLES in lib/billingCycle.ts.
    cycle: { type: String, enum: ['', 'weekly', 'monthly', 'quarterly', 'yearly', 'biennial'], default: '' },
    // #33: on a spawned instance, the _id of the bill whose payment created it. The successor's
    // own _id is derived from it (that is what blocks a second spawn, see lib/billRecurrence.ts);
    // this field keeps the link queryable and keeps linked rows out of the legacy fallback.
    // '' on hand-entered bills and on pre-#33 successors.
    recurrenceParentId: { type: String, default: '', index: true },
    notes: { type: String, default: '' },
    // P68 φάση 3 (#14): το ίδιο optional per-property ledger tag με `Expense.space` (P34),
    // `Receipt.space` και `Subscription.space`, από το ίδιο taxonomy `AppConfig.spaces`.
    // '' = χωρίς χώρο. Ένας λογαριασμός είναι πραγματική δαπάνη, αλλά ΔΕΝ αθροίζεται μόνος του
    // στο per-space card: μπαίνει εκεί μέσω του expense που γράφει η πληρωμή του, το οποίο
    // κληρονομεί αυτό το tag — αλλιώς ένας πληρωμένος λογαριασμός θα μετριόταν δύο φορές.
    space: { type: String, default: '', index: true },
    archived: { type: Boolean, default: false, index: true },
    linkedExpenseId: { type: String, default: '' }, // set when "mark paid" also logged an expense
  },
  { timestamps: true }
);

// Incremental-sync cursor (lib/apiList withSince → updatedAt $gte) for a future GET /api/v1/bills.
BillSchema.index({ updatedAt: -1 });

BillSchema.plugin(softDeletePlugin);
BillSchema.plugin(createdByPlugin); // P75: who added it (display only)

export type BillDoc = InferSchemaType<typeof BillSchema> & { _id: string };

export const Bill: Model<BillDoc> =
  (models.Bill as Model<BillDoc>) || model<BillDoc>('Bill', BillSchema);
