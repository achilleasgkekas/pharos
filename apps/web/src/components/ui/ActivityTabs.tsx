'use client';
// Jobs (background work) and History (Ask Pharos conversations) are one entry in the
// account menu; this bar under each page's title switches between them.
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useT } from '@/components/LocaleProvider';
import { cn } from './cn';

const TABS = [
  { href: '/jobs', key: 'nav.jobs' },
  { href: '/history', key: 'nav.history' },
] as const;

export function ActivityTabs() {
  const t = useT();
  const pathname = usePathname();
  return (
    <div role="tablist" className="mb-5 flex gap-1 border-b border-[color:var(--color-border)]">
      {TABS.map((x) => {
        const on = pathname.startsWith(x.href);
        return (
          <Link
            key={x.href}
            href={x.href}
            role="tab"
            aria-selected={on}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-sm transition-colors',
              on ? 'border-[color:var(--color-accent)] font-semibold text-[color:var(--color-text)]' : 'border-transparent text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)]'
            )}
          >
            {t(x.key)}
          </Link>
        );
      })}
    </div>
  );
}
