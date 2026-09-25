import { Schema, model, models, type Model, type InferSchemaType } from 'mongoose';
import { softDeletePlugin } from '@/lib/softDelete';

// P110 (#126): one fuel fill or one service on a vehicle. `cost` is base currency, like every
// other money amount. When the user logs it as an expense too, `expenseId` points at it.
const VehicleLogSchema = new Schema(
  {
    vehicleId: { type: Schema.Types.ObjectId, ref: 'Vehicle', required: true, index: true },
    kind: { type: String, enum: ['fuel', 'service'], required: true },
    date: { type: Date, required: true },
    odometer: { type: Number, default: null, min: 0 }, // km at the time
    cost: { type: Number, default: 0, min: 0 },
    liters: { type: Number, default: 0, min: 0 }, // fuel only
    fullTank: { type: Boolean, default: true }, // fuel only: partial fills roll into the next full one
    description: { type: String, default: '' }, // service: what was done
    shop: { type: String, default: '' }, // garage / fuel station
    expenseId: { type: String, default: '' },
  },
  { timestamps: true }
);

VehicleLogSchema.index({ vehicleId: 1, kind: 1, date: -1 });
VehicleLogSchema.index({ updatedAt: -1 });
VehicleLogSchema.plugin(softDeletePlugin);

export type VehicleLogDoc = InferSchemaType<typeof VehicleLogSchema> & { _id: string };
export const VehicleLog: Model<VehicleLogDoc> =
  (models.VehicleLog as Model<VehicleLogDoc>) || model<VehicleLogDoc>('VehicleLog', VehicleLogSchema);
