import { getAccountData } from './actions';
import { AccountManager } from './AccountManager';
import { PAGE_MAIN, PageHeader } from '@/components/ui/PageHeader';
import { getServerT } from '@/lib/i18n/server';

export const dynamic = 'force-dynamic';

export default async function AccountPage() {
  const data = await getAccountData();
  const { t } = await getServerT();

  return (
    <main className={PAGE_MAIN}>
      <div className="max-w-4xl mx-auto space-y-6">
        <PageHeader
          title={t('account.title')}
          subtitle={t('account.subtitle')}
        />
        <AccountManager initialData={data} />
      </div>
    </main>
  );
}
