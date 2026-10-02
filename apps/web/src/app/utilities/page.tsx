import { connectDB } from '@/lib/db';
import { getAppSettings } from '@/lib/appSettings';
import { currentModel } from '@/lib/tenancy/connection';
import { withRequestTenant } from '@/lib/tenancy/request';
import { MeterReading as MeterReadingModel } from '@/models/MeterReading';
import type { ReadingLike } from '@/lib/meterReadings';
import { UtilitiesClient } from './UtilitiesClient';
import { aiFeatureStatus } from '@/lib/aiFeatures.server';

export const dynamic = 'force-dynamic';

async function getData(): Promise<{ readings: ReadingLike[]; spaces: string[]; scanOn: boolean }> {
  return withRequestTenant(async () => {
    await connectDB();
    const MeterReading = await currentModel(MeterReadingModel);
    const [docs, settings, scan] = await Promise.all([
      MeterReading.find().sort({ readingAt: 1, createdAt: 1 }).lean(),
      getAppSettings(),
      aiFeatureStatus('meters'),
    ]);
    return { readings: JSON.parse(JSON.stringify(docs)), spaces: settings.spaces, scanOn: scan === 'ready' };
  });
}

export default async function UtilitiesPage() {
  const data = await getData();
  return <UtilitiesClient {...data} />;
}
