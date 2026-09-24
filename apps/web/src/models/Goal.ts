import { Schema, model, models, type Model, type InferSchemaType } from 'mongoose';
import { softDeletePlugin } from '@/lib/softDelete';

// A single manual contribution toward a goal (same shape as a bill payment). Positive
// amount = money put aside; a mistaken entry is removed rather than negated.
const GoalContributionSchema = new Schema(
  {
    amount: { type: Number, required: true },
    date: { type: Date, default: () => new Date() },
    note: { type: String, default: '' },
  },
  { _id: true }
);

// P12 — savings / financial goal (a target to reach, distinct from a budget which
// is a spending LIMIT). `current` is always derived as Σ(contributions.amount),
// never stored, so it can never drift out of sync with the ledger.
const GoalSchema = new Schema(
  {
    title: { type: String, required: true }, // "Emergency fund", "Sailing trip"
    targetAmount: { type: Number, required: true, default: 0 },
    targetDate: { type: Date, default: null, index: true }, // optional deadline
    category: { type: String, default: '' }, // free-form descriptive tag, no auto-feed (phase 2)
    notes: { type: String, default: '' },
    archived: { type: Boolean, default: false, index: true }, // manually closed (reached/abandoned)
    contributions: { type: [GoalContributionSchema], default: [] },
  },
  { timestamps: true }
);

// Incremental-sync cursor (lib/apiList withSince → updatedAt $gte) for a future GET /api/v1/goals.
GoalSchema.index({ updatedAt: -1 });

GoalSchema.plugin(softDeletePlugin);

export type GoalDoc = InferSchemaType<typeof GoalSchema> & { _id: string };

export const Goal: Model<GoalDoc> = (models.Goal as Model<GoalDoc>) || model<GoalDoc>('Goal', GoalSchema);
