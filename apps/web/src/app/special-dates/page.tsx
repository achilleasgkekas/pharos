import { connectDB } from '@/lib/db';
import { SpecialDate as SpecialDateModel } from '@/models/SpecialDate';
import { withRequestTenant } from '@/lib/tenancy/request';
import { currentModel } from '@/lib/tenancy/connection';
import { getAppSettings } from '@/lib/appSettings';
import { SpecialDatesClient } from './SpecialDatesClient';
import type { SerializedSpecialDate } from '@/types';

export const dynamic = 'force-dynamic';

async function getData(): Promise<{ dates: SerializedSpecialDate[]; leadDays: number }> {
  return withRequestTenant(async () => {
    await connectDB();
    const SpecialDate = await currentModel(SpecialDateModel);
    const [dates, settings] = await Promise.all([
      SpecialDate.find().lean(), // client sorts by next occurrence (a computed value)
      getAppSettings(),
    ]);
    return {
      dates: JSON.parse(JSON.stringify(dates)),
      leadDays: settings.specialDateAlertDays,
    };
  });
}

export default async function SpecialDatesPage() {
  const { dates, leadDays } = await getData();
  return <SpecialDatesClient dates={dates} leadDays={leadDays} />;
}
