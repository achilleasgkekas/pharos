'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { useLocale, useT } from '@/components/LocaleProvider';
import { useAttributionNames } from '@/components/CreatedBy';
import { formatDateTime, relTime } from '@/lib/i18n/format';
import type { TKey } from '@/lib/i18n';
import type { ActivityEvent, ActivityType } from '@/lib/activity';
import { getHouseholdActivity } from './activityActions';

const TYPE_KEY: Record<ActivityType, TKey> = {
  item: 'act.typeItem',
  expense: 'act.typeExpense',
  income: 'act.typeIncome',
  receipt: 'act.typeReceipt',
  bill: 'act.typeBill',
  subscription: 'act.typeSubscription',
  voucher: 'act.typeVoucher',
  document: 'act.typeDocument',
  task: 'act.typeTask',
  goal: 'act.typeGoal',
  specialDate: 'act.typeSpecialDate',
  vehicle: 'act.typeVehicle',
  vehicleLog: 'act.typeVehicleLog',
  meterReading: 'act.typeMeterReading',
  shoppingListItem: 'act.typeShoppingListItem',
};

/**
 * P89 (#23): Settings → Activity. Who in the household added or trashed what, newest first.
 * Loaded on open (not with the Settings page) so the other tabs never pay for it.
 */
export function ActivityFeed() {
  const t = useT();
  const locale = useLocale();
  const names = useAttributionNames();
  const [events, setEvents] = useState<ActivityEvent[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let live = true;
    getHouseholdActivity()
      .then((e) => live && setEvents(e))
      .catch(() => live && setError(true));
    return () => {
      live = false;
    };
  }, []);

  return (
    <section className="bg-[color:var(--color-surface)] border border-[color:var(--color-border)] rounded-2xl p-5">
      <h2 className="text-lg font-semibold mb-1" style={{ fontFamily: 'var(--font-display)' }}>
        {t('set.tabActivity')}
      </h2>
      <p className="text-xs text-[color:var(--color-text-dim)] mb-4">{t('act.intro')}</p>

      {error ? (
        <p className="text-sm text-[color:var(--color-red)]">{t('act.loadError')}</p>
      ) : events === null ? (
        <div className="flex items-center gap-2 text-sm text-[color:var(--color-text-dim)]">
          <Loader2 size={14} className="animate-spin" /> {t('common.loading')}
        </div>
      ) : events.length === 0 ? (
        <p className="text-sm text-[color:var(--color-text-faint)]">{t('act.empty')}</p>
      ) : (
        <ul className="divide-y divide-[color:var(--color-border)]">
          {events.map((e) => {
            const who = names?.[e.userId] || t('act.someone');
            const what = t(TYPE_KEY[e.type]);
            return (
              <li key={`${e.kind}-${e.type}-${e.id}`} className="flex items-start gap-3 py-2.5">
                <span
                  className="mt-0.5 shrink-0"
                  style={{ color: e.kind === 'added' ? 'var(--color-accent)' : 'var(--color-red)' }}
                  aria-hidden
                >
                  {e.kind === 'added' ? <Plus size={14} /> : <Trash2 size={14} />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm">
                    <span className="font-semibold">{who}</span>{' '}
                    <span className="text-[color:var(--color-text-dim)]">
                      {t(e.kind === 'added' ? 'act.added' : 'act.deleted', { what })}
                    </span>{' '}
                    {e.href ? (
                      <Link href={e.href} className="underline decoration-dotted hover:text-[color:var(--color-accent)] break-words">
                        {e.title}
                      </Link>
                    ) : (
                      <span className="break-words">{e.title}</span>
                    )}
                  </div>
                  <time
                    dateTime={e.at}
                    title={formatDateTime(e.at, locale)}
                    className="text-[10px] text-[color:var(--color-text-faint)]"
                    style={{ fontFamily: 'var(--font-mono)' }}
                  >
                    {relTime(e.at, t)}
                  </time>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
