import { connectDB } from '@/lib/db';
import { getAppSettings } from '@/lib/appSettings';
import { currentModel } from '@/lib/tenancy/connection';
import { withRequestTenant } from '@/lib/tenancy/request';
import { Vehicle as VehicleModel } from '@/models/Vehicle';
import { VehicleLog as VehicleLogModel } from '@/models/VehicleLog';
import { VehiclesClient } from './VehiclesClient';
import type { LogRow, VehicleRow } from './shared';

export const dynamic = 'force-dynamic';

async function getData(): Promise<{ vehicles: VehicleRow[]; logs: LogRow[]; spaces: string[]; currency: string; leadDays: number }> {
  return withRequestTenant(async () => {
    await connectDB();
    const [Vehicle, VehicleLog] = await Promise.all([currentModel(VehicleModel), currentModel(VehicleLogModel)]);
    const [vehicles, logs, settings] = await Promise.all([
      Vehicle.find().sort({ archived: 1, name: 1 }).select('-attachments').lean(),
      // The overview only needs what the cards summarize, not invoice lines or files.
      VehicleLog.find().sort({ date: -1, createdAt: -1 }).select('vehicleId kind date odometer cost liters fullTank nextServiceKm nextServiceDate').lean(),
      getAppSettings(),
    ]);
    return {
      vehicles: JSON.parse(JSON.stringify(vehicles)),
      logs: JSON.parse(JSON.stringify(logs)),
      spaces: settings.spaces,
      currency: settings.currency,
      leadDays: settings.documentAlertDays,
    };
  });
}

export default async function VehiclesPage() {
  const data = await getData();
  return <VehiclesClient {...data} />;
}
