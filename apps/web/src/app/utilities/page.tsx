import { connectDB } from '@/lib/db';
import { getAppSettings } from '@/lib/appSettings';
import { currentModel } from '@/lib/tenancy/connection';
import { withRequestTenant } from '@/lib/tenancy/request';
import { MeterReading as MeterReadingModel } from '@/models/MeterReading';
import type { ReadingLike } from '@/lib/meterReadings';
import { UtilitiesClient } from './UtilitiesClient';

export const dynamic = 'force-dynamic';

async function getData(): Promise<{ readings: ReadingLike[]; spaces: string[] }> {
  return withRequestTenant(async () => {
    await connectDB();
    const MeterReading = await currentModel(MeterReadingModel);
    const [docs, settings] = await Promise.all([
      MeterReading.find().sort({ readingAt: 1, createdAt: 1 }).lean(),
      getAppSettings(),
    ]);
    return { readings: JSON.parse(JSON.stringify(docs)), spaces: settings.spaces };
  });
}

export default async function UtilitiesPage() {
  const data = await getData();
  return <UtilitiesClient {...data} />;
}
