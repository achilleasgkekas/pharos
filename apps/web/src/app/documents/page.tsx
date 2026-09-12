import { connectDB } from '@/lib/db';
import { Document as DocumentModel } from '@/models/Document';
import { withRequestTenant } from '@/lib/tenancy/request';
import { currentModel } from '@/lib/tenancy/connection';
import { getAppSettings } from '@/lib/appSettings';
import { DocumentsClient } from './DocumentsClient';
import type { SerializedDocument } from '@/types';

export const dynamic = 'force-dynamic';

async function getData(): Promise<{ documents: SerializedDocument[]; leadDays: number }> {
  return withRequestTenant(async () => {
    await connectDB();
    const Document = await currentModel(DocumentModel);
    const [documents, settings] = await Promise.all([
      // Soonest expiry first — the order you renew documents in.
      Document.find().sort({ expiryDate: 1 }).lean(),
      getAppSettings(),
    ]);
    return {
      documents: JSON.parse(JSON.stringify(documents)),
      leadDays: settings.documentAlertDays,
    };
  });
}

export default async function DocumentsPage() {
  const { documents, leadDays } = await getData();
  return <DocumentsClient documents={documents} leadDays={leadDays} />;
}
