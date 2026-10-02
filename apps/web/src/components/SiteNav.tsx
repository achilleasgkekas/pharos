'use client';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Settings,
  LogOut,
  Activity,
  MessageSquare,
  Trash2,
  Home,
  Wallet,
  Plus,
  Receipt,
  ShoppingBasket,
  ArrowRight,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { cn } from './ui/cn';
import { Modal } from './ui/Modal';
import { PharosMark } from './PharosMark';
import { AiCommandBar } from './AiCommandBar';
import { logoutAction } from '@/app/login/actions';
import { useT } from './LocaleProvider';
import { NotificationBell } from './NotificationBell';
import { useAttributionNames } from './CreatedBy';
import type { Role } from '@/lib/roles';
import type { TKey } from '@/lib/i18n';
import { NAV_GROUPS, HOME_ITEM, navActive, navGroupOf, type NavGroup } from '@/lib/nav';
import { normalizeSettingsTab, settingsHref, visibleSettingsGroups } from './settingsNav';

type SessionUser = { name: string; role: Role };

/*
 * The app shell (redesign, docs/ui-conventions.md):
 *  - computer: a sidebar with every page by section (collapsible to icons), and a top bar
 *    with search, the bell and the account menu. In Settings the sidebar lists the settings.
 *  - phone: a top bar, the current section's pages as tabs under it, and a section bar at
 *    the bottom (Home, Money, Shopping, House, Planner). No "More" page.
 */

const LAST_KEY = (g: NavGroup) => `pharos.nav.last:${g.key}`;
const LAST_EVENT = 'pharos:nav-last';
const SIDEBAR_EVENT = 'pharos:sidebar';

/** Subscribe to one of the shell's own window events (a stored choice that changed). */
function onEvent(name: string) {
  return (cb: () => void) => {
    window.addEventListener(name, cb);
    return () => window.removeEventListener(name, cb);
  };
}
const subscribeSidebar = onEvent(SIDEBAR_EVENT);
const subscribeLast = onEvent(LAST_EVENT);
const sidebarCollapsed = () => document.documentElement.getAttribute('data-sidebar') === 'collapsed';
/** The last page of every section, as one string so the snapshot compares by value. */
function lastPagesSnapshot(): string {
  try {
    return NAV_GROUPS.map((g) => localStorage.getItem(LAST_KEY(g)) ?? '').join('\n');
  } catch {
    return '';
  }
}

function initials(name: string): string {
  const parts = name.trim().split(/[\s._-]+/).filter(Boolean);
  const s = parts.length > 1 ? parts[0][0] + parts[1][0] : name.slice(0, 2);
  return (s || 'U').toUpperCase();
}

// ─── Sidebar (computer) ─────────────────────────────────────────────────────

function SidebarLink({ item, label, active }: { item: { href: string; icon: React.ComponentType<{ size?: number; className?: string }> }; label: string; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      prefetch={false}
      title={label}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex items-center gap-3 h-[30px] px-3 rounded-lg text-sm transition-colors',
        active
          ? 'bg-[color:var(--color-surface-2)] text-[color:var(--color-text)] font-semibold shadow-[inset_2px_0_0_var(--color-accent)]'
          : 'text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)] hover:bg-[color:var(--color-surface)]'
      )}
    >
      <Icon size={17} className={cn('shrink-0', active && 'text-[color:var(--color-accent)]')} />
      <span className="sb-label truncate">{label}</span>
    </Link>
  );
}

function AppSidebarNav() {
  const t = useT();
  const pathname = usePathname();
  return (
    <nav aria-label={t('nav.menu')} className="space-y-3">
      <SidebarLink item={HOME_ITEM} label={t(HOME_ITEM.key)} active={pathname === '/'} />
      {NAV_GROUPS.map((g) => (
        <div key={g.key}>
          <div className="sb-label px-3 mb-0.5 text-xs font-semibold text-[color:var(--color-text-faint)]">{t(g.key)}</div>
          <div>
            {g.links.map((l) => (
              <SidebarLink key={l.href} item={l} label={t(l.key)} active={navActive(pathname, l.href)} />
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}

function SettingsSidebarNav({ role }: { role: Role }) {
  const t = useT();
  const params = useSearchParams();
  const multiUser = useAttributionNames() !== null;
  const current = normalizeSettingsTab(params.get('tab'));
  const groups = visibleSettingsGroups({ isAdmin: role === 'admin', multiUser });
  const ref = useRef<HTMLElement>(null);
  // The list is taller than a laptop screen: keep the open page in view, so opening
  // About or System status from a link does not leave the sidebar showing the top.
  useEffect(() => {
    ref.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest' });
  }, [current]);
  return (
    <nav ref={ref} aria-label={t('nav.settings')} className="space-y-3">
      <Link href="/" prefetch={false} title={t('set.backToApp')} className="flex items-center gap-3 h-9 px-3 rounded-lg text-sm font-medium text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)] hover:bg-[color:var(--color-surface)] transition-colors">
        <ChevronLeft size={17} className="shrink-0" /> <span className="sb-label">{t('set.backToApp')}</span>
      </Link>
      {groups.map((g) => (
        <div key={g.label}>
          <div className="sb-label px-3 mb-0.5 text-xs font-semibold text-[color:var(--color-text-faint)]">{t(g.label)}</div>
          <div>
            {g.tabs.map((tab) => (
              <SidebarLink key={tab.id} item={{ href: settingsHref(tab.id), icon: tab.icon }} label={t(tab.label)} active={current === tab.id} />
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}

function Sidebar({ user }: { user?: SessionUser }) {
  const t = useT();
  const pathname = usePathname();
  const collapsed = useSyncExternalStore(subscribeSidebar, sidebarCollapsed, () => false);
  const inSettings = pathname.startsWith('/settings');

  function toggle() {
    const next = !collapsed;
    if (next) document.documentElement.setAttribute('data-sidebar', 'collapsed');
    else document.documentElement.removeAttribute('data-sidebar');
    try {
      localStorage.setItem('pharos.sidebar', next ? 'collapsed' : 'open');
    } catch {
      /* private mode */
    }
    window.dispatchEvent(new Event(SIDEBAR_EVENT));
  }

  return (
    <aside className="hidden lg:flex fixed inset-y-0 left-0 z-40 w-[var(--sidebar-w)] flex-col border-r border-[color:var(--color-border)] bg-[color:var(--color-bg)]">
      <Link href="/" prefetch={false} title="PHAROS" className="h-16 shrink-0 flex items-center gap-2.5 px-[26px] hover:opacity-80 transition-opacity">
        <PharosMark size={22} className="text-[color:var(--color-accent)] shrink-0" />
        <span className="sb-label tracking-[0.14em] text-[15px]" style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}>
          PHAROS
        </span>
      </Link>
      <div className="flex-1 min-h-0 overflow-y-auto thin-scrollbar px-3 pb-4">
        {inSettings && user ? (
          <Suspense fallback={null}>
            <SettingsSidebarNav role={user.role} />
          </Suspense>
        ) : (
          <AppSidebarNav />
        )}
      </div>
      <div className="shrink-0 border-t border-[color:var(--color-border)] px-3 py-2 flex items-center gap-1">
        {!inSettings && (
          <div className="flex-1 min-w-0">
            <SidebarLink item={{ href: '/settings', icon: Settings }} label={t('nav.settings')} active={false} />
          </div>
        )}
        <button
          type="button"
          onClick={toggle}
          title={collapsed ? t('nav.expandSidebar') : t('nav.collapseSidebar')}
          aria-label={collapsed ? t('nav.expandSidebar') : t('nav.collapseSidebar')}
          className={cn('shrink-0 grid place-items-center w-10 h-10 rounded-lg text-[color:var(--color-text-faint)] hover:text-[color:var(--color-text)] hover:bg-[color:var(--color-surface)] transition-colors', inSettings && 'ml-auto')}
        >
          {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>
      </div>
    </aside>
  );
}

// ─── Account menu ───────────────────────────────────────────────────────────

const ACCOUNT_MENU: { href: string; key: TKey; icon: React.ComponentType<{ size?: number; className?: string }> }[] = [
  { href: '/settings', key: 'nav.settings', icon: Settings },
  { href: '/jobs', key: 'nav.jobs', icon: Activity },
  { href: '/history', key: 'nav.history', icon: MessageSquare },
  { href: '/trash', key: 'nav.trash', icon: Trash2 },
];

function AccountMenuItems({ user, onNavigate }: { user: SessionUser; onNavigate: () => void }) {
  const t = useT();
  const pathname = usePathname();
  const row = 'w-full flex items-center gap-3 h-11 px-3 rounded-lg text-sm transition-colors';
  return (
    <div>
      <Link
        href={settingsHref('account')}
        prefetch={false}
        onClick={onNavigate}
        className="flex items-center gap-3 px-3 py-2.5 mb-1 rounded-xl hover:bg-[color:var(--color-surface-2)] transition-colors"
      >
        <span className="w-10 h-10 shrink-0 rounded-full grid place-items-center text-sm font-bold bg-[color:var(--color-surface-2)] border border-[color:var(--color-border-light)]">
          {initials(user.name)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold truncate">{user.name}</span>
          <span className="block text-xs text-[color:var(--color-text-dim)] truncate">{t('nav.accountHint')}</span>
        </span>
        <ChevronRight size={16} className="shrink-0 text-[color:var(--color-text-faint)]" />
      </Link>
      <div className="border-t border-[color:var(--color-border)] pt-1">
        {ACCOUNT_MENU.map((m) => {
          const Icon = m.icon;
          const active = navActive(pathname, m.href);
          return (
            <Link
              key={m.href}
              href={m.href}
              prefetch={false}
              onClick={onNavigate}
              className={cn(row, active ? 'text-[color:var(--color-text)] font-semibold bg-[color:var(--color-surface-2)]' : 'text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)] hover:bg-[color:var(--color-surface-2)]')}
            >
              <Icon size={17} className="shrink-0" /> {t(m.key)}
            </Link>
          );
        })}
      </div>
      <form action={logoutAction} className="border-t border-[color:var(--color-border)] mt-1 pt-1">
        <button type="submit" className={cn(row, 'text-[color:var(--color-text-dim)] hover:text-[color:var(--color-red)] hover:bg-[color:var(--color-surface-2)]')}>
          <LogOut size={17} className="shrink-0" /> {t('nav.signOut')}
        </button>
      </form>
    </div>
  );
}

function AccountMenu({ user }: { user: SessionUser }) {
  const t = useT();
  const [mode, setMode] = useState<'closed' | 'dropdown' | 'sheet'>('closed');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (mode !== 'dropdown') return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setMode('closed');
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMode('closed');
    }
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [mode]);

  function toggle() {
    if (mode !== 'closed') return setMode('closed');
    setMode(window.matchMedia('(min-width: 1024px)').matches ? 'dropdown' : 'sheet');
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-label={t('nav.account')}
        aria-expanded={mode !== 'closed'}
        className="w-11 h-11 lg:w-10 lg:h-10 grid place-items-center rounded-full"
      >
        <span className="w-8 h-8 lg:w-9 lg:h-9 rounded-full grid place-items-center text-xs font-bold bg-[color:var(--color-surface-2)] border border-[color:var(--color-border-light)] hover:border-[color:var(--color-text-faint)] transition-colors">
          {initials(user.name)}
        </span>
      </button>
      {mode === 'dropdown' && (
        <div className="absolute right-0 top-full mt-2 z-50 w-72 rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] shadow-2xl shadow-black/40 p-1.5">
          <AccountMenuItems user={user} onNavigate={() => setMode('closed')} />
        </div>
      )}
      <Modal open={mode === 'sheet'} onClose={() => setMode('closed')} title={t('nav.account')} size="sm">
        <AccountMenuItems user={user} onNavigate={() => setMode('closed')} />
      </Modal>
    </div>
  );
}

// ─── Phone: section tabs, section bar, quick add ────────────────────────────

/** The pages of the current section as tabs under the phone's top bar. */
function SectionTabs({ group }: { group: NavGroup }) {
  const t = useT();
  const pathname = usePathname();
  const activeRef = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [pathname]);
  return (
    <nav aria-label={t(group.key)} className="lg:hidden flex gap-1 overflow-x-auto no-scrollbar px-2 h-11 border-t border-[color:var(--color-border)]">
      {group.links.map((l) => {
        const active = navActive(pathname, l.href);
        return (
          <Link
            key={l.href}
            ref={active ? activeRef : undefined}
            href={l.href}
            prefetch={false}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'shrink-0 flex items-center px-3 text-sm whitespace-nowrap transition-colors',
              active ? 'text-[color:var(--color-text)] font-semibold shadow-[inset_0_-2px_0_var(--color-accent)]' : 'text-[color:var(--color-text-dim)]'
            )}
          >
            {t(l.key)}
          </Link>
        );
      })}
    </nav>
  );
}

function SectionBar() {
  const t = useT();
  const pathname = usePathname();
  const current = navGroupOf(pathname);
  const lastRaw = useSyncExternalStore(subscribeLast, lastPagesSnapshot, () => '');

  // Remember the last page of each section, so its tab brings you back where you were.
  useEffect(() => {
    const g = navGroupOf(pathname);
    if (!g) return;
    try {
      localStorage.setItem(LAST_KEY(g), pathname);
    } catch {
      return; /* private mode: every tab opens its section's first page */
    }
    window.dispatchEvent(new Event(LAST_EVENT));
  }, [pathname]);

  const lastList = lastRaw.split('\n');
  const last: Record<string, string> = {};
  NAV_GROUPS.forEach((grp, i) => {
    const v = lastList[i];
    if (v && grp.links.some((l) => navActive(v, l.href))) last[grp.key] = v;
  });

  const items: { key: string; href: string; label: string; icon: React.ComponentType<{ size?: number }>; active: boolean }[] = [
    { key: 'home', href: '/', label: t('nav.home'), icon: Home, active: pathname === '/' },
    ...NAV_GROUPS.map((g) => ({
      key: g.key,
      href: last[g.key] ?? g.links[0].href,
      label: t(g.shortKey),
      icon: g.icon,
      active: current?.key === g.key,
    })),
  ];

  return (
    <nav
      aria-label={t('nav.sections')}
      className="lg:hidden fixed bottom-0 inset-x-0 z-40 grid grid-cols-5 border-t border-[color:var(--color-border)] bg-[color:var(--color-bg)]/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)]"
    >
      {items.map((it) => {
        const Icon = it.icon;
        return (
          <Link
            key={it.key}
            href={it.href}
            prefetch={false}
            aria-current={it.active ? 'page' : undefined}
            className={cn(
              'h-16 flex flex-col items-center justify-center gap-1 text-[11px] min-w-0 px-1 transition-colors',
              it.active ? 'text-[color:var(--color-accent)] font-semibold' : 'text-[color:var(--color-text-dim)]'
            )}
          >
            <Icon size={21} />
            <span className="truncate max-w-full">{it.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function QuickAddSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const options = [
    { href: '/receipts?open=new', icon: Receipt, title: t('nav.scanReceipt'), desc: t('home.dReceipts') },
    { href: '/expenses?open=new', icon: Wallet, title: t('nav.addExpense'), desc: t('ex.balancesEmpty') },
    { href: '/shopping-list?open=new', icon: ShoppingBasket, title: t('nav.addShoppingItem'), desc: t('home.dShoppingList') },
  ];
  return (
    <Modal open={open} onClose={onClose} title={t('nav.quickAdd')} size="sm">
      <div className="space-y-2 py-1">
        {options.map((opt) => {
          const Icon = opt.icon;
          return (
            <Link
              key={opt.href}
              href={opt.href}
              onClick={onClose}
              className="flex items-center gap-3.5 p-3 rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] hover:bg-[color:var(--color-surface-2)] transition-colors"
            >
              <div className="w-10 h-10 rounded-xl grid place-items-center shrink-0 bg-[color:var(--color-surface-2)] text-[color:var(--color-accent)]">
                <Icon size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{opt.title}</p>
                <p className="text-xs text-[color:var(--color-text-dim)] truncate">{opt.desc}</p>
              </div>
              <ArrowRight size={16} className="text-[color:var(--color-text-faint)] shrink-0" />
            </Link>
          );
        })}
      </div>
    </Modal>
  );
}

/** Phone only, on Home: the one place to add anything. List pages have their own "+". */
function HomeQuickAdd() {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t('nav.quickAdd')}
        className="lg:hidden fixed right-4 z-30 bottom-[calc(80px+env(safe-area-inset-bottom))] w-14 h-14 rounded-full grid place-items-center bg-[color:var(--color-accent)] text-[color:var(--color-on-accent)] shadow-[0_8px_24px_rgba(0,0,0,0.5)] active:scale-95 transition-transform"
      >
        <Plus size={24} strokeWidth={2.4} />
      </button>
      <QuickAddSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}

// ─── Top bar ────────────────────────────────────────────────────────────────

/** What the phone's top bar calls the current page: its section, or the page itself. */
function useMobileTitle(): string {
  const t = useT();
  const pathname = usePathname();
  const group = navGroupOf(pathname);
  if (group) return t(group.key);
  const solo: { href: string; key: TKey }[] = [
    { href: '/settings', key: 'nav.settings' },
    { href: '/jobs', key: 'nav.jobs' },
    { href: '/history', key: 'nav.history' },
    { href: '/trash', key: 'nav.trash' },
    { href: '/notifications', key: 'notif.title' },
  ];
  const hit = solo.find((s) => navActive(pathname, s.href));
  return hit ? t(hit.key) : '';
}

export function SiteNav({ aiReady = false, user }: { aiReady?: boolean; user?: SessionUser }) {
  const t = useT();
  const pathname = usePathname();
  const [notifOpen, setNotifOpen] = useState(false);
  const group = navGroupOf(pathname);
  const mobileTitle = useMobileTitle();

  return (
    <>
      <Sidebar user={user} />
      <header className="sticky top-0 z-30 border-b border-[color:var(--color-border)] bg-[color:var(--color-bg)]/95 backdrop-blur-md lg:pl-[var(--sidebar-w)]">
        <div className="h-14 lg:h-16 flex items-center gap-1 lg:gap-2 pl-4 pr-2 lg:px-8">
          <Link href="/" prefetch={false} className="lg:hidden flex items-center gap-2 min-w-0 shrink" aria-label="PHAROS">
            <PharosMark size={22} className="text-[color:var(--color-accent)] shrink-0" />
            {mobileTitle ? (
              <span className="text-[17px] font-semibold truncate" style={{ fontFamily: 'var(--font-display)' }}>{mobileTitle}</span>
            ) : (
              <span className="tracking-[0.14em] text-sm" style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}>PHAROS</span>
            )}
          </Link>
          <div className="hidden lg:flex flex-1 min-w-0">
            <AiCommandBar />
          </div>
          <div className="flex-1 lg:hidden" />
          <div className="lg:hidden">
            <AiCommandBar compact />
          </div>
          <Link
            href={settingsHref('ai')}
            prefetch={false}
            className={cn('hidden lg:flex items-center gap-1.5 text-xs px-2 h-10 rounded-lg hover:bg-[color:var(--color-surface)]', aiReady ? 'text-[color:var(--color-accent)]' : 'text-[color:var(--color-text-faint)]')}
            title={aiReady ? t('ai.reachable') : t('ai.notConfigured')}
          >
            <span className={cn('h-1.5 w-1.5 rounded-full', aiReady ? 'bg-[color:var(--color-accent)]' : 'bg-[color:var(--color-text-faint)]')} />
            {aiReady ? t('ai.online') : t('ai.offline')}
          </Link>
          {user && <NotificationBell open={notifOpen} onOpenChange={setNotifOpen} />}
          {user && <AccountMenu user={user} />}
        </div>
        {group && <SectionTabs group={group} />}
      </header>
      <SectionBar />
      {pathname === '/' && <HomeQuickAdd />}
    </>
  );
}

