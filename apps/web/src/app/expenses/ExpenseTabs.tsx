'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useT } from '@/components/LocaleProvider';
import { cn } from '@/components/ui/cn';

/** Expenses has two tabs: what you paid, and the bills still to pay. Paying a bill logs it
 *  under the first, so the two never count the same money twice. */
export function ExpenseTabs({ toPay }: { toPay: number }) {
  const t = useT();
  const path = usePathname();
  const tabs = [
    { href: '/expenses', label: t('nav.expenses'), active: path === '/expenses' },
    { href: '/expenses/to-pay', label: t('ex.tabToPay'), active: path.startsWith('/expenses/to-pay'), count: toPay },
  ];
  return (
    <nav aria-label={t('nav.expenses')} className="mb-4 flex gap-1 overflow-x-auto no-scrollbar border-b border-[color:var(--color-border)]">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          aria-current={tab.active ? 'page' : undefined}
          className={cn(
            'shrink-0 px-3 py-2 text-sm border-b-2 -mb-px transition-colors whitespace-nowrap',
            tab.active ? 'border-[color:var(--color-accent)] text-[color:var(--color-text)] font-semibold' : 'border-transparent text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)]'
          )}
        >
          {tab.label}
          {!!tab.count && (
            <span className="ml-1.5 rounded-full bg-[color:var(--color-surface-2)] px-1.5 py-0.5 text-[11px] tabular-nums text-[color:var(--color-text-dim)]">{tab.count}</span>
          )}
        </Link>
      ))}
    </nav>
  );
}
