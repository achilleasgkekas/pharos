import { Schema, model, models, type Model, type InferSchemaType } from 'mongoose';
import { softDeletePlugin } from '@/lib/softDelete';
import { createdByPlugin } from '@/lib/createdBy';

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
    // #363 (all optional, so older logs keep working):
    pricePerLiter: { type: Number, default: null, min: 0 }, // fuel: as printed on the pump receipt
    fuelType: { type: String, default: '' }, // fuel: what was put in, e.g. 'diesel'
    filePath: { type: String, default: '' }, // the scanned receipt / invoice kept with the entry
    // service: the invoice lines, when known (parts and labour)
    items: {
      type: [
        {
          description: { type: String, default: '' },
          kind: { type: String, enum: ['part', 'labor', 'other'], default: 'other' },
          cost: { type: Number, default: 0, min: 0 },
        },
      ],
      default: [],
    },
    // service: the next one as the garage wrote it on the invoice; overrides the vehicle's interval
    nextServiceKm: { type: Number, default: null, min: 0 },
    nextServiceDate: { type: Date, default: null },
  },
  { timestamps: true }
);

VehicleLogSchema.index({ vehicleId: 1, kind: 1, date: -1 });
VehicleLogSchema.index({ updatedAt: -1 });
VehicleLogSchema.plugin(softDeletePlugin);
VehicleLogSchema.plugin(createdByPlugin); // P75: who added it (display only)

export type VehicleLogDoc = InferSchemaType<typeof VehicleLogSchema> & { _id: string };
export const VehicleLog: Model<VehicleLogDoc> =
  (models.VehicleLog as Model<VehicleLogDoc>) || model<VehicleLogDoc>('VehicleLog', VehicleLogSchema);
