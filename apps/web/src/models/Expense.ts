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
    amount: { type: Number, default: 0 }, // gross amount (income positive, expense positive)
    currency: { type: String, default: 'EUR' },
    date: { type: Date, required: true, index: true },
    period: { type: String, default: '' }, // YYYY-MM the document covers (for recurring tracking)

    // Recurring series: the user marks a vendor as recurring; scanned bills with the
    // same vendorKey are auto-linked into the series even when the amount varies.
    recurring: { type: Boolean, default: false },
    recurringCycle: { type: String, enum: ['monthly', 'quarterly', 'yearly', 'weekly', ''], default: '' },

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

    rawAiResponse: { type: String, default: '' },
    aiModel: { type: String, default: '' },
    aiParsedAt: { type: Date, default: null },
    verified: { type: Boolean, default: false },
  },
  { timestamps: true }
);

ExpenseSchema.index({ kind: 1, vendorKey: 1, date: -1 }); // series timeline per vendor
// Incremental-sync cursor (lib/apiList withSince → updatedAt $gte) for GET /api/v1/expenses.
ExpenseSchema.index({ updatedAt: -1 });

ExpenseSchema.plugin(softDeletePlugin);

export type ExpenseDoc = InferSchemaType<typeof ExpenseSchema> & { _id: string };

export const Expense: Model<ExpenseDoc> =
  (models.Expense as Model<ExpenseDoc>) || model<ExpenseDoc>('Expense', ExpenseSchema);
