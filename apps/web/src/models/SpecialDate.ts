import { Schema, model, models, type Model, type InferSchemaType } from 'mongoose';
import { softDeletePlugin } from '@/lib/softDelete';

// P50 — recurring personal dates: birthdays, anniversaries, namedays. PHAROS is a
// "Personal Hub" but tracked no recurring personal dates at all. Distinct from Documents
// (P42, static papers that expire once) and Bills (a financial obligation).
//
// Stored as month + day (1-based), NOT a full date: these recur every year, so a required
// year would be wrong. `year` is OPTIONAL (0 = unknown) purely to show age / years-married
// on the reminder. "Days until" is computed against the NEXT occurrence (lib/specialDates.ts).
const SpecialDateSchema = new Schema(
  {
    name: { type: String, required: true }, // "Mum", "Άννα & Νίκος", "Γιώργος nameday"
    type: { type: String, default: 'birthday', index: true }, // free-form: birthday / anniversary / nameday / …
    month: { type: Number, required: true, min: 1, max: 12 },
    day: { type: Number, required: true, min: 1, max: 31 },
    year: { type: Number, default: 0 }, // 0 = unknown; else the birth/since year for age display
    notes: { type: String, default: '' },
    archived: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

SpecialDateSchema.index({ updatedAt: -1 });

SpecialDateSchema.plugin(softDeletePlugin);

export type SpecialDateDoc = InferSchemaType<typeof SpecialDateSchema> & { _id: string };

export const SpecialDate: Model<SpecialDateDoc> =
  (models.SpecialDate as Model<SpecialDateDoc>) || model<SpecialDateDoc>('SpecialDate', SpecialDateSchema);
