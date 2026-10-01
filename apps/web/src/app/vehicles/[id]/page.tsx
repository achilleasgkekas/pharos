import { notFound } from 'next/navigation';
import { isValidObjectId } from 'mongoose';
import { connectDB } from '@/lib/db';
import { getAppSettings } from '@/lib/appSettings';
import { aiFeatureStatus } from '@/lib/aiFeatures.server';
import { currentModel } from '@/lib/tenancy/connection';
import { withRequestTenant } from '@/lib/tenancy/request';
import { Vehicle as VehicleModel } from '@/models/Vehicle';
import { VehicleLog as VehicleLogModel } from '@/models/VehicleLog';
import { VehicleDetailClient } from '../VehicleDetailClient';
import type { LogRow, VehicleRow } from '../shared';

export const dynamic = 'force-dynamic';

// #363: one page per vehicle, opened from its card on /vehicles.
export default async function VehiclePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isValidObjectId(id)) notFound();
  const data = await withRequestTenant(async () => {
    await connectDB();
    const [Vehicle, VehicleLog] = await Promise.all([currentModel(VehicleModel), currentModel(VehicleLogModel)]);
    const vehicle = await Vehicle.findById(id).lean();
    if (!vehicle) return null;
    const [logs, settings, scan] = await Promise.all([
      VehicleLog.find({ vehicleId: id }).sort({ date: -1, createdAt: -1 }).lean(),
      getAppSettings(),
      aiFeatureStatus('vehicles'),
    ]);
    return {
      vehicle: JSON.parse(JSON.stringify(vehicle)) as VehicleRow,
      logs: JSON.parse(JSON.stringify(logs)) as LogRow[],
      spaces: settings.spaces,
      currency: settings.currency,
      leadDays: settings.documentAlertDays,
      scanEnabled: scan !== 'disabled',
    };
  });
  if (!data) notFound();
  return <VehicleDetailClient {...data} />;
}
