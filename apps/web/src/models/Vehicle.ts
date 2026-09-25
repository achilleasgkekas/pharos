import { Schema, model, models, type Model, type InferSchemaType } from 'mongoose';
import { softDeletePlugin } from '@/lib/softDelete';

// P110 (#126): a car or motorbike, with the dates that expire on it. Fuel fills and services
// live in VehicleLog; consumption, cost per km and the current odometer are derived from the
// logs (lib/vehicles.ts), never stored here, so correcting a log fixes every figure.
const VehicleSchema = new Schema(
  {
    name: { type: String, required: true, trim: true }, // "Golf", "Kalamos car"
    plate: { type: String, default: '', trim: true },
    make: { type: String, default: '', trim: true },
    model: { type: String, default: '', trim: true },
    year: { type: Number, default: null },
    space: { type: String, default: '', trim: true, index: true }, // per-property tag (P34/P68)
    notes: { type: String, default: '' },
    // Dates that lapse; each one alerts like a document (lib/vehicles.ts collectVehicleDue).
    motUntil: { type: Date, default: null }, // ΚΤΕΟ / MOT / TÜV
    insuranceUntil: { type: Date, default: null },
    roadTaxUntil: { type: Date, default: null }, // τέλη κυκλοφορίας
    emissionsUntil: { type: Date, default: null }, // κάρτα καυσαερίων
    archived: { type: Boolean, default: false, index: true }, // sold / scrapped, history kept
  },
  { timestamps: true }
);

VehicleSchema.index({ updatedAt: -1 });
VehicleSchema.plugin(softDeletePlugin);

export type VehicleDoc = InferSchemaType<typeof VehicleSchema> & { _id: string };
export const Vehicle: Model<VehicleDoc> = (models.Vehicle as Model<VehicleDoc>) || model<VehicleDoc>('Vehicle', VehicleSchema);
