import { Schema, model, models, type Model, type InferSchemaType } from 'mongoose';
import { softDeletePlugin } from '@/lib/softDelete';
import { createdByPlugin } from '@/lib/createdBy';

const StepSchema = new Schema(
  {
    text: { type: String, required: true },
    done: { type: Boolean, default: false },
  },
  { _id: true }
);

const TaskSchema = new Schema(
  {
    title: { type: String, required: true },
    description: { type: String, default: '' },
    content: { type: String, default: '' }, // rich notes / details (merged from Phases)
    steps: { type: [StepSchema], default: [] }, // checklist of sub-steps
    tags: { type: [String], default: [], index: true },
    status: {
      type: String,
      enum: ['todo', 'in-progress', 'done', 'blocked'],
      default: 'todo',
      index: true,
    },
    priority: {
      type: String,
      enum: ['low', 'normal', 'high'],
      default: 'normal',
    },
    num: { type: String, default: '' }, // ordering (from migrated phases)
    dueDate: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    relatedItemIds: { type: [Schema.Types.ObjectId], ref: 'Item', default: [] },
  },
  { timestamps: true }
);

// Incremental-sync cursor (lib/apiList withSince → updatedAt $gte) AND sort key for GET /api/v1/tasks.
TaskSchema.index({ updatedAt: -1 });

TaskSchema.plugin(softDeletePlugin);
TaskSchema.plugin(createdByPlugin); // P75: who added it (display only)

export type TaskDoc = InferSchemaType<typeof TaskSchema> & { _id: string };

export const Task: Model<TaskDoc> =
  (models.Task as Model<TaskDoc>) || model<TaskDoc>('Task', TaskSchema);
