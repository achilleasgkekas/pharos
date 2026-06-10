import { Schema, model, models, type Model, type InferSchemaType } from 'mongoose';

const PhaseSchema = new Schema(
  {
    num: { type: String, required: true, index: true },
    title: { type: String, required: true },
    content: { type: String, default: '' }, // HTML
    notes: { type: String, default: '' }, // user's personal notes
    status: {
      type: String,
      enum: ['todo', 'in-progress', 'done'],
      default: 'todo',
      index: true,
    },
    estimatedHours: { type: Number, default: 0 },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export type PhaseDoc = InferSchemaType<typeof PhaseSchema> & { _id: string };

export const Phase: Model<PhaseDoc> =
  (models.Phase as Model<PhaseDoc>) || model<PhaseDoc>('Phase', PhaseSchema);
