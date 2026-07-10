'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useRef, useEffect } from 'react';
import {
  Package, ShoppingCart, ShoppingBasket, CheckSquare, Receipt as ReceiptIcon, CalendarClock, CreditCard,
  Menu, X, Sun, Moon, Settings, BarChart3, Ticket, Wallet, Banknote, ChevronDown, CalendarDays,
  LogOut, UserRound, Activity, MessageSquare, Trash2, FileText,
} from 'lucide-react';
import { cn } from './ui/cn';
import { useTheme } from './ThemeProvider';
import { PharosMark } from './PharosMark';
import { AiCommandBar } from './AiCommandBar';
import { logoutAction } from '@/app/login/actions';
import { useT } from './LocaleProvider';
import { LanguageSwitcher } from './LanguageSwitcher';
import { NotificationBell } from './NotificationBell';
import type { TKey } from '@/lib/i18n';

type SessionUser = { name: string; role: 'admin' | 'member' };

type NavLink = { href: string; key: TKey; icon: typeof Package };

const STUFF: NavLink[] = [
  { href: '/items', key: 'nav.inventory', icon: Package },
  { href: '/shopping', key: 'nav.shopping', icon: ShoppingCart },
  { href: '/shopping-list', key: 'nav.shoppingList', icon: ShoppingBasket },
];
const MONEY: NavLink[] = [
  { href: '/receipts', key: 'nav.receipts', icon: ReceiptIcon },
  { href: '/expenses', key: 'nav.expenses', icon: Wallet },
  { href: '/bills', key: 'nav.bills', icon: FileText },
  { href: '/income', key: 'nav.income', icon: Banknote },
  { href: '/statements', key: 'nav.statements', icon: CreditCard },
  { href: '/subscriptions', key: 'nav.subscriptions', icon: CalendarClock },
  { href: '/vouchers', key: 'nav.vouchers', icon: Ticket },
  { href: '/calendar', key: 'nav.calendar', icon: CalendarDays },
];
const PLAN: NavLink[] = [
  { href: '/tasks', key: 'nav.tasks', icon: CheckSquare },
  { href: '/reports', key: 'nav.reports', icon: BarChart3 },
];
const ACTIVITY: NavLink[] = [
  { href: '/jobs', key: 'nav.jobs', icon: Activity },
  { href: '/history', key: 'nav.history', icon: MessageSquare },
  { href: '/trash', key: 'nav.trash', icon: Trash2 },
];
const GROUPS: { key: TKey; links: NavLink[] }[] = [
  { key: 'nav.stuff', links: STUFF },
  { key: 'nav.money', links: MONEY },
  { key: 'nav.plan', links: PLAN },
  { key: 'nav.activity', links: ACTIVITY },
];
const ALL_LINKS = [...STUFF, ...MONEY, ...PLAN, ...ACTIVITY];

/** Segment-aware active match. Plain `startsWith(href)` is wrong for sibling prefixes
 *  like /shopping vs /shopping-list (the former would match the latter). */
function navActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + '/');
}

function NavGroup({ groupKey, links }: { groupKey: TKey; links: NavLink[] }) {
  const t = useT();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = links.some((l) => navActive(pathname, l.href));
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-sm font-medium transition-all',
          active ? 'text-[color:var(--color-accent)]' : 'text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)] hover:bg-[color:var(--color-surface)]'
        )}
      >
        {t(groupKey)}
        <ChevronDown size={13} className={cn('transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 min-w-44 rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] shadow-2xl shadow-black/40 p-1">
          {links.map((l) => {
            const Icon = l.icon;
            const isActive = navActive(pathname, l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                prefetch={false}
                onClick={() => setOpen(false)}
                className={cn(
                  'flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm transition-colors',
                  isActive ? 'text-[color:var(--color-accent)] bg-[color:var(--color-surface-2)]' : 'text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)] hover:bg-[color:var(--color-surface-2)]'
                )}
              >
                <Icon size={15} /> {t(l.key)}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function UserMenu({ user }: { user: SessionUser }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center p-2 rounded-lg text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)] hover:bg-[color:var(--color-surface)] transition-colors"
        aria-label={t('nav.account')}
      >
        <UserRound size={17} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 min-w-44 rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] shadow-2xl shadow-black/40 p-1">
          <div className="px-2.5 py-2 border-b border-[color:var(--color-border)] mb-1">
            <p className="text-sm font-medium truncate">{user.name}</p>
            <p className="text-[11px] text-[color:var(--color-text-faint)] uppercase" style={{ fontFamily: 'var(--font-mono)' }}>
              {user.role}
            </p>
          </div>
          <form action={logoutAction}>
            <button
              type="submit"
              className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm text-[color:var(--color-text-dim)] hover:text-[color:var(--color-red)] hover:bg-[color:var(--color-surface-2)] transition-colors"
            >
              <LogOut size={15} /> {t('nav.signOut')}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

export function SiteNav({ aiReady = false, user }: { aiReady?: boolean; user?: SessionUser }) {
  const t = useT();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { theme, toggle } = useTheme();

  // Solid bg on the sticky navbar (no backdrop-filter): a backdrop-filter here would
  // become the containing block for the AI spotlight's `fixed inset-0` backdrop and
  // clip it to the navbar's height instead of covering the whole viewport.
  return (
    <header className="sticky top-0 z-40 border-b border-[color:var(--color-border)] bg-[color:var(--color-bg)]">
      <div className="max-w-[1400px] mx-auto px-4 py-2.5 flex items-center gap-3">
        {/* Logo */}
        <Link href="/" prefetch={false} title="PHAROS · Personal Hub · Asset & Resource Oversight System" className="flex items-center gap-2 shrink-0 hover:opacity-80 transition-opacity">
          <PharosMark size={22} className="text-[color:var(--color-accent)] shrink-0" />
          <span className="hidden sm:inline tracking-[0.14em] uppercase" style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}>
            Pharos
          </span>
        </Link>

        {/* Central command bar */}
        <div className="flex-1 flex justify-center min-w-0">
          <AiCommandBar />
        </div>

        {/* Grouped links (desktop) */}
        <nav className="hidden lg:flex items-center gap-0.5 shrink-0">
          {GROUPS.map((g) => (
            <NavGroup key={g.key} groupKey={g.key} links={g.links} />
          ))}
        </nav>

        {/* Right actions */}
        <div className="flex items-center gap-1 shrink-0">
          <span
            className={cn('hidden sm:flex items-center gap-1.5 text-[11px] mr-1', aiReady ? 'text-[color:var(--color-accent)]' : 'text-[color:var(--color-text-faint)]')}
            style={{ fontFamily: 'var(--font-mono)' }}
            title={aiReady ? t('ai.reachable') : t('ai.notConfigured')}
          >
            <span className={cn('h-1.5 w-1.5 rounded-full', aiReady ? 'bg-[color:var(--color-accent)]' : 'bg-[color:var(--color-text-faint)]')} />
            {aiReady ? t('ai.online') : t('ai.offline')}
          </span>
          <LanguageSwitcher />
          {user && <NotificationBell />}
          <button onClick={toggle} className="p-2 rounded-lg text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)] hover:bg-[color:var(--color-surface)] transition-colors" aria-label="Toggle theme">
            {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          <Link
            href="/settings"
            prefetch={false}
            className={cn('p-2 rounded-lg transition-colors', pathname.startsWith('/settings') ? 'text-[color:var(--color-accent)]' : 'text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)] hover:bg-[color:var(--color-surface)]')}
            aria-label={t('nav.settings')}
          >
            <Settings size={17} />
          </Link>
          {user && <UserMenu user={user} />}
          <button onClick={() => setMobileOpen((v) => !v)} className="lg:hidden p-2 rounded-lg text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)] hover:bg-[color:var(--color-surface)] transition-colors" aria-label="Menu">
            {mobileOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      {/* Mobile menu — all links */}
      {mobileOpen && (
        <nav className="lg:hidden border-t border-[color:var(--color-border)] px-4 py-2 grid grid-cols-2 sm:grid-cols-3 gap-1">
          {ALL_LINKS.map((link) => {
            const active = navActive(pathname, link.href);
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                prefetch={false}
                onClick={() => setMobileOpen(false)}
                className={cn('flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-all', active ? 'bg-[color:var(--color-surface-2)] text-[color:var(--color-accent)]' : 'text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)]')}
              >
                <Icon size={16} /> {t(link.key)}
              </Link>
            );
          })}
        </nav>
      )}
    </header>
  );
}
