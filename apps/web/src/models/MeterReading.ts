import { Schema, model, models, type Model, type InferSchemaType } from 'mongoose';
import { softDeletePlugin } from '@/lib/softDelete';

// P49 — a manual cumulative utility-meter observation. Utility type and unit stay
// free-form because providers and meters vary by country; consumption is derived from
// adjacent readings and is never stored, so correcting an older reading fixes every delta.
const MeterReadingSchema = new Schema(
  {
    meter: { type: String, required: true, trim: true, index: true },
    utilityType: { type: String, required: true, trim: true, index: true },
    unit: { type: String, required: true, trim: true },
    readingAt: { type: Date, required: true, index: true },
    value: { type: Number, required: true, min: 0 },
    space: { type: String, default: '', trim: true, index: true },
    notes: { type: String, default: '' },
  },
  { timestamps: true }
);

MeterReadingSchema.index({ meter: 1, space: 1, unit: 1, readingAt: 1 });
MeterReadingSchema.index({ updatedAt: -1 });
MeterReadingSchema.plugin(softDeletePlugin);

export type MeterReadingDoc = InferSchemaType<typeof MeterReadingSchema> & { _id: string };
export const MeterReading: Model<MeterReadingDoc> =
  (models.MeterReading as Model<MeterReadingDoc>) || model<MeterReadingDoc>('MeterReading', MeterReadingSchema);
