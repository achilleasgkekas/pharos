'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  LayoutDashboard,
  SlidersHorizontal,
  Sparkles,
  Users,
  BarChart3,
  Activity,
  CreditCard,
  UserRound,
} from 'lucide-react';
import { cn } from '@/components/ui/cn';

export type WorkspaceTab = { href: string; label: string; active: boolean };

/** Icon per tab, keyed by the STABLE part of its href (workspaceTabs.ts's `path`, before any
 *  `?w=` query is appended). */
const TAB_ICON: Record<string, typeof LayoutDashboard> = {
  '/account/workspace': LayoutDashboard,
  '/account/workspace/settings': SlidersHorizontal,
  '/account/workspace/ai': Sparkles,
  '/account/workspace/members': Users,
  '/account/workspace/usage': BarChart3,
  '/account/workspace/activity': Activity,
  '/account/workspace/billing': CreditCard,
  '/account/settings': UserRound,
};

function tabIcon(href: string): typeof LayoutDashboard {
  const path = href.split('?')[0];
  return TAB_ICON[path] ?? LayoutDashboard;
}

export function WorkspaceTabNav({ tabs }: { tabs: WorkspaceTab[] }) {
  const activeTabRef = useRef<HTMLAnchorElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (activeTabRef.current) {
      activeTabRef.current.scrollIntoView?.({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'nearest',
      });
    }
  }, [tabs]);

  if (!tabs || tabs.length === 0) return null;

  return (
    <nav aria-label="Workspace" className="md:w-52 md:shrink-0">
      <div
        ref={containerRef}
        className="flex md:flex-col gap-1.5 overflow-x-auto scroll-smooth md:overflow-visible md:sticky md:top-20 pb-1 md:pb-0 -mx-4 px-4 md:mx-0 md:px-0 [mask-image:linear-gradient(to_right,transparent,black_12px,black_calc(100%-12px),transparent)] md:[mask-image:none]"
      >
        {tabs.map((t) => {
          const Icon = tabIcon(t.href);
          return (
            <Link
              key={t.href}
              ref={t.active ? activeTabRef : undefined}
              href={t.href}
              aria-current={t.active ? 'page' : undefined}
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all shrink-0 md:w-full',
                t.active
                  ? 'bg-[color:var(--color-accent)] text-black'
                  : 'bg-[color:var(--color-surface-2)] md:bg-transparent border border-[color:var(--color-border)] md:border-transparent text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)] hover:bg-[color:var(--color-surface-2)]'
              )}
            >
              <Icon size={15} />
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
