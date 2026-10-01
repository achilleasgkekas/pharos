import { Schema, model, models, type Model, type InferSchemaType } from 'mongoose';
import { softDeletePlugin } from '@/lib/softDelete';
import { createdByPlugin } from '@/lib/createdBy';
import { VEHICLE_FUEL_TYPES } from '@/lib/vehicles';

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
    tyreChangeUntil: { type: Date, default: null }, // seasonal / worn tyres (#363)
    batteryUntil: { type: Date, default: null }, // 12 V battery replacement (#363)

    // #363: more about the car. Every field is optional with an empty default, so vehicles
    // saved before these existed keep working without a migration.
    photoPath: { type: String, default: '' },
    vin: { type: String, default: '', trim: true },
    fuelType: { type: String, enum: VEHICLE_FUEL_TYPES, default: '' },
    engineCc: { type: Number, default: null, min: 0 },
    powerKw: { type: Number, default: null, min: 0 },
    transmission: { type: String, enum: ['', 'manual', 'automatic'], default: '' },
    color: { type: String, default: '', trim: true },
    firstRegistration: { type: Date, default: null },
    purchaseDate: { type: Date, default: null },
    purchasePrice: { type: Number, default: null, min: 0 }, // base currency
    purchaseSeller: { type: String, default: '', trim: true },
    purchaseOdometer: { type: Number, default: null, min: 0 },
    tankCapacity: { type: Number, default: null, min: 0 }, // litres, or kWh for an electric car
    tyreSize: { type: String, default: '', trim: true },
    tyrePressure: { type: String, default: '', trim: true }, // free text: "2.3 / 2.5 bar"
    oilType: { type: String, default: '', trim: true },
    oilCapacity: { type: Number, default: null, min: 0 }, // litres
    serviceIntervalKm: { type: Number, default: null, min: 0 },
    serviceIntervalMonths: { type: Number, default: null, min: 0 },
    insurer: { type: String, default: '', trim: true },
    policyNumber: { type: String, default: '', trim: true },
    coverType: { type: String, default: '', trim: true }, // third party / full / ...
    insuranceYearlyCost: { type: Number, default: null, min: 0 }, // renewal date = insuranceUntil
    // Registration certificate, insurance card, inspection report... (same shape as Item attachments)
    attachments: {
      type: [
        {
          path: { type: String, required: true },
          name: { type: String, default: '' },
          mimeType: { type: String, default: '' },
          size: { type: Number, default: 0 },
          uploadedAt: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
    archived: { type: Boolean, default: false, index: true }, // sold / scrapped, history kept
  },
  { timestamps: true }
);

VehicleSchema.index({ updatedAt: -1 });
VehicleSchema.plugin(softDeletePlugin);
VehicleSchema.plugin(createdByPlugin); // P75: who added it (display only)

export type VehicleDoc = InferSchemaType<typeof VehicleSchema> & { _id: string };
export const Vehicle: Model<VehicleDoc> = (models.Vehicle as Model<VehicleDoc>) || model<VehicleDoc>('Vehicle', VehicleSchema);
