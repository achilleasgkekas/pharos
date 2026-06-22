import { Schema, model, models, type Model, type InferSchemaType } from 'mongoose';

// A background job lives in MongoDB so it survives page reloads / server restarts
// and is visible identically from EVERY device (laptop + phone) — they all poll
// the same record. A single in-process worker (lib/jobRunner) does the actual work.
const JobSchema = new Schema(
  {
    kind: { type: String, enum: ['rescan-receipts', 'ai-fill-items', 'sync-onedrive'], required: true },
    title: { type: String, required: true }, // "Re-scan receipts"
    href: { type: String, default: '' }, // page to open from the widget / notification

    status: { type: String, enum: ['running', 'done', 'error'], default: 'running', index: true },

    itemIds: { type: [String], default: [] }, // the work list (receipt or item ids)
    labels: { type: [String], default: [] }, // parallel display labels (store / title)
    useOcr: { type: Boolean, default: true }, // rescan: force OCR (auto-rotate)

    total: { type: Number, default: 0 },
    done: { type: Number, default: 0 },
    ok: { type: Number, default: 0 }, // items that succeeded (recovered / enriched)

    current: { type: String, default: '' }, // label of the item being processed now
    lastLabel: { type: String, default: '' }, // the item that just finished
    lastOk: { type: Boolean, default: true },
    lastDetail: { type: String, default: '' },

    error: { type: String, default: '' },
    finishedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export type JobDoc = InferSchemaType<typeof JobSchema> & { _id: string };

export const Job: Model<JobDoc> = (models.Job as Model<JobDoc>) || model<JobDoc>('Job', JobSchema);
