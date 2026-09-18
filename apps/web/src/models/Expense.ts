import { Schema, model, models, type Model, type InferSchemaType } from 'mongoose';
import { softDeletePlugin } from '@/lib/softDelete';

/**
 * An income or expense document — rent, electricity, fuel, a payslip, etc.
 * Works like a receipt (scan a PDF/image → AI parse → keep the file), but tracked
 * by VENDOR (φορέας) so recurring series (e.g. every electricity bill) group together.
 * `kind` splits the two tabs: 'income' (salary…) vs 'expense' (bills…).
 */
const ExpenseSchema = new Schema(
  {
    kind: { type: String, enum: ['income', 'expense'], default: 'expense', index: true },
    vendor: { type: String, default: '', index: true }, // ΔΕΗ, landlord, employer…
    vendorKey: { type: String, default: '', index: true }, // normalized vendor → groups a recurring series
    category: { type: String, default: 'other', index: true }, // rent/utilities/fuel/salary/insurance/…
    space: { type: String, default: '', index: true }, // per-property/context ledger tag (P34); '' = unassigned

    // Tax / deductible tagging (P8). Free-form taxCategory (optional GR presets suggested in
    // the UI) so the year-end export can group by it; taxDeductible gates which expenses that
    // export includes at all.
    taxDeductible: { type: Boolean, default: false, index: true },
    taxCategory: { type: String, default: '' },
    // Multi-currency (P9). INVARIANT: `amount` is always in the deployment's BASE currency,
    // so every aggregation can keep summing it directly. A foreign document also keeps what
    // was printed on it: `currency` = printed ISO code, `origAmount` = printed number,
    // `fxRate` = base per 1 unit of `currency`. All of it derives from lib/fx.ts resolveFx().
    amount: { type: Number, default: 0 }, // gross amount in BASE currency (income/expense both positive)
    currency: { type: String, default: 'EUR' },
    origAmount: { type: Number, default: 0 }, // amount as printed; 0 when not foreign
    fxRate: { type: Number, default: 0 }, // base units per 1 `currency` unit; 0 = unknown/not foreign
    date: { type: Date, required: true, index: true },
    period: { type: String, default: '' }, // YYYY-MM the document covers (for recurring tracking)

    // Recurring series: the user marks a vendor as recurring; scanned bills with the
    // same vendorKey are auto-linked into the series even when the amount varies.
    recurring: { type: Boolean, default: false },
    // Kept in sync with RECURRING_CYCLES in lib/billingCycle.ts.
    recurringCycle: { type: String, enum: ['monthly', 'quarterly', 'yearly', 'weekly', 'biennial', ''], default: '' },

    filePath: { type: String, default: '' }, // /storage/expenses/...  (empty for manual entries)
    fileType: { type: String, default: '' },
    thumbPath: { type: String, default: '' }, // 1st-page JPEG for PDF cards
    fileSize: { type: Number, default: 0 },

    paymentMethod: { type: String, default: '' },
    notes: { type: String, default: '' },

    // Expense splitting (P35 — Splitwise-lite). You paid the total; each entry is another
    // person (free-form name, not an app account) who owes you `share`. `settled` = paid back.
    split: {
      type: [
        new Schema(
          {
            name: { type: String, default: '' },
            share: { type: Number, default: 0 },
            settled: { type: Boolean, default: false },
          },
          { _id: false }
        ),
      ],
      default: [],
    },

    // Payment-method split (P62) — ONE purchase paid with SEVERAL methods (e.g. part
    // gift card, part card). Empty array = paid with the single `paymentMethod` above,
    // i.e. exactly the pre-P62 behaviour. `giftCardId` optionally points at a P32
    // GiftCard, in which case saving mirrors the row into that card's `uses[]` log.
    // Distinct from `split` above: that is between PEOPLE, this is between METHODS.
    paymentSplits: {
      type: [
        new Schema(
          {
            method: { type: String, default: '' },
            amount: { type: Number, default: 0 },
            giftCardId: { type: String, default: '' },
          },
          { _id: false }
        ),
      ],
      default: [],
    },

    rawAiResponse: { type: String, default: '' },
    aiModel: { type: String, default: '' },
    aiParsedAt: { type: Date, default: null },
    verified: { type: Boolean, default: false },

    // Demo/sample-data mode (P1): see Item.isSample.
    isSample: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

ExpenseSchema.index({ kind: 1, vendorKey: 1, date: -1 }); // series timeline per vendor
// Unique index to prevent duplicate auto-generated recurring entries during concurrent cron runs.
ExpenseSchema.index({ kind: 1, vendorKey: 1, date: 1, recurring: 1, aiModel: 1 }, { unique: true });
// Incremental-sync cursor (lib/apiList withSince → updatedAt $gte) for GET /api/v1/expenses.
ExpenseSchema.index({ updatedAt: -1 });

ExpenseSchema.plugin(softDeletePlugin);

export type ExpenseDoc = InferSchemaType<typeof ExpenseSchema> & { _id: string };

export const Expense: Model<ExpenseDoc> =
  (models.Expense as Model<ExpenseDoc>) || model<ExpenseDoc>('Expense', ExpenseSchema);
