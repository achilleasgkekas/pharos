'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useRef, useEffect, useMemo } from 'react';
import {
  ChevronDown,
  Sun,
  Moon,
  Settings,
  LogOut,
  UserRound,
  Activity,
  MessageSquare,
  Trash2,
  Home,
  Wallet,
  CalendarDays,
  Plus,
  Menu,
  Search,
  X,
  Receipt,
  ShoppingBasket,
  ArrowRight,
} from 'lucide-react';
import { cn } from './ui/cn';
import { Modal } from './ui/Modal';
import { useTheme } from './ThemeProvider';
import { PharosMark } from './PharosMark';
import { AiCommandBar } from './AiCommandBar';
import { logoutAction } from '@/app/login/actions';
import { useT } from './LocaleProvider';
import { LanguageSwitcher } from './LanguageSwitcher';
import { NotificationBell } from './NotificationBell';
import type { Role } from '@/lib/roles';
import {
  NAV_GROUPS,
  MONEY_LINKS,
  ACCOUNT_LINKS,
  ALL_NAV_ITEMS,
  navActive,
  type NavGroup,
} from '@/lib/nav';

type SessionUser = { name: string; role: Role };

function NavGroupDropdown({ group }: { group: NavGroup }) {
  const t = useT();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = group.links.some((l) => navActive(pathname, l.href));

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
          active
            ? 'text-[color:var(--color-accent)]'
            : 'text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)] hover:bg-[color:var(--color-surface)]'
        )}
      >
        {t(group.key)}
        <ChevronDown size={13} className={cn('transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 min-w-44 rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] shadow-2xl shadow-black/40 p-1">
          {group.links.map((l) => {
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
                  isActive
                    ? 'text-[color:var(--color-accent)] bg-[color:var(--color-surface-2)]'
                    : 'text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)] hover:bg-[color:var(--color-surface-2)]'
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
  const pathname = usePathname();
  const { theme, toggle } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const menuRow =
    'w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)] hover:bg-[color:var(--color-surface-2)] transition-colors';

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
        <div className="absolute right-0 top-full mt-1 z-50 min-w-52 rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] shadow-2xl shadow-black/40 p-1">
          <div className="px-2.5 py-2 border-b border-[color:var(--color-border)] mb-1">
            <p className="text-sm font-medium truncate">{user.name}</p>
            <p className="text-[11px] text-[color:var(--color-text-faint)] uppercase" style={{ fontFamily: 'var(--font-mono)' }}>
              {user.role}
            </p>
          </div>

          <Link
            href={'/profile'}
            prefetch={false}
            onClick={() => setOpen(false)}
            className={cn(menuRow, pathname.startsWith('/profile') && 'text-[color:var(--color-accent)]')}
          >
            <UserRound size={15} /> {t('nav.profile')}
          </Link>
          <Link
            href={'/settings'}
            prefetch={false}
            onClick={() => setOpen(false)}
            className={cn(menuRow, pathname.startsWith('/settings') && 'text-[color:var(--color-accent)]')}
          >
            <Settings size={15} /> {t('nav.settings')}
          </Link>
          <Link
            href={'/jobs'}
            prefetch={false}
            onClick={() => setOpen(false)}
            className={cn(menuRow, pathname.startsWith('/jobs') && 'text-[color:var(--color-accent)]')}
          >
            <Activity size={15} /> {t('nav.jobs')}
          </Link>
          <Link
            href={'/history'}
            prefetch={false}
            onClick={() => setOpen(false)}
            className={cn(menuRow, pathname.startsWith('/history') && 'text-[color:var(--color-accent)]')}
          >
            <MessageSquare size={15} /> {t('nav.history')}
          </Link>
          <Link
            href={'/trash'}
            prefetch={false}
            onClick={() => setOpen(false)}
            className={cn(menuRow, pathname.startsWith('/trash') && 'text-[color:var(--color-accent)]')}
          >
            <Trash2 size={15} /> {t('nav.trash')}
          </Link>

          <div className="my-1 border-t border-[color:var(--color-border)]" />
          <LanguageSwitcher variant="row" />
          <button type="button" onClick={toggle} className={menuRow}>
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
            {theme === 'dark' ? t('nav.lightMode') : t('nav.darkMode')}
          </button>

          <div className="my-1 border-t border-[color:var(--color-border)]" />
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

function MobileMoreSheet({
  open,
  onClose,
  user,
}: {
  open: boolean;
  onClose: () => void;
  user?: SessionUser;
}) {
  const t = useT();
  const pathname = usePathname();
  const { theme, toggle } = useTheme();
  const [search, setSearch] = useState('');

  // Filter items across all nav items
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return null;
    return ALL_NAV_ITEMS.filter((item) => {
      const label = t(item.key).toLowerCase();
      const href = item.href.toLowerCase();
      return label.includes(q) || href.includes(q);
    });
  }, [search, t]);

  const menuRow =
    'w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)] hover:bg-[color:var(--color-surface-2)] transition-colors';

  return (
    <Modal open={open} onClose={onClose} title={t('nav.more')} size="full">
      <div className="space-y-6 pb-12">
        {/* Search jump bar */}
        <div className="relative">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[color:var(--color-text-dim)] pointer-events-none" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('nav.searchPages')}
            className="w-full bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] rounded-xl pl-10 pr-9 py-2.5 text-sm text-[color:var(--color-text)] placeholder:text-[color:var(--color-text-dim)] focus:outline-none focus:border-[color:var(--color-accent)] transition-colors"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)] p-0.5"
              aria-label={t('common.clear')}
            >
              <X size={15} />
            </button>
          )}
        </div>

        {/* Filtered results */}
        {filtered !== null ? (
          <div>
            {filtered.length === 0 ? (
              <p className="text-center py-8 text-sm text-[color:var(--color-text-dim)]">{t('bar.noMatches')}</p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {filtered.map((item) => {
                  const Icon = item.icon;
                  const isActive = navActive(pathname, item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      prefetch={false}
                      onClick={onClose}
                      className={cn(
                        'flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-sm font-medium transition-colors min-w-0',
                        isActive
                          ? 'border-[color:var(--color-accent)] bg-[color:var(--color-surface-2)] text-[color:var(--color-accent)]'
                          : 'border-[color:var(--color-border)] bg-[color:var(--color-surface)] text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)] hover:bg-[color:var(--color-surface-2)]'
                      )}
                    >
                      <Icon size={16} className="shrink-0" />
                      <span className="truncate">{t(item.key)}</span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Standard grouped navigation */}
            <div className="space-y-6">
              {NAV_GROUPS.map((g) => (
                <div key={g.key}>
                  <h3
                    className="text-[11px] font-semibold uppercase tracking-wider text-[color:var(--color-text-faint)] mb-2 px-1"
                    style={{ fontFamily: 'var(--font-mono)' }}
                  >
                    {t(g.key)}
                  </h3>
                  <div className="grid grid-cols-2 gap-2">
                    {g.links.map((link) => {
                      const Icon = link.icon;
                      const isActive = navActive(pathname, link.href);
                      return (
                        <Link
                          key={link.href}
                          href={link.href}
                          prefetch={false}
                          onClick={onClose}
                          className={cn(
                            'flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-sm font-medium transition-colors min-w-0',
                            isActive
                              ? 'border-[color:var(--color-accent)] bg-[color:var(--color-surface-2)] text-[color:var(--color-accent)]'
                              : 'border-[color:var(--color-border)] bg-[color:var(--color-surface)] text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)] hover:bg-[color:var(--color-surface-2)]'
                          )}
                        >
                          <Icon size={16} className="shrink-0" />
                          <span className="truncate">{t(link.key)}</span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Bottom account / settings / system section */}
            <div className="pt-4 border-t border-[color:var(--color-border)] space-y-2">
              <h3
                className="text-[11px] font-semibold uppercase tracking-wider text-[color:var(--color-text-faint)] mb-2 px-1"
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                {t('nav.account')}
              </h3>

              {user && (
                <div className="px-3 py-2 rounded-xl bg-[color:var(--color-surface)] border border-[color:var(--color-border)] mb-3 flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{user.name}</p>
                    <p className="text-[10px] text-[color:var(--color-text-faint)] uppercase" style={{ fontFamily: 'var(--font-mono)' }}>
                      {user.role}
                    </p>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                {ACCOUNT_LINKS.map((link) => {
                  const Icon = link.icon;
                  const isActive = navActive(pathname, link.href);
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      prefetch={false}
                      onClick={onClose}
                      className={cn(
                        'flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-sm font-medium transition-colors min-w-0',
                        isActive
                          ? 'border-[color:var(--color-accent)] bg-[color:var(--color-surface-2)] text-[color:var(--color-accent)]'
                          : 'border-[color:var(--color-border)] bg-[color:var(--color-surface)] text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)] hover:bg-[color:var(--color-surface-2)]'
                      )}
                    >
                      <Icon size={16} className="shrink-0" />
                      <span className="truncate">{t(link.key)}</span>
                    </Link>
                  );
                })}
              </div>

              <div className="pt-2 space-y-1">
                <LanguageSwitcher variant="row" />
                <button type="button" onClick={toggle} className={menuRow}>
                  {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
                  {theme === 'dark' ? t('nav.lightMode') : t('nav.darkMode')}
                </button>
                <form action={logoutAction} className="pt-1">
                  <button
                    type="submit"
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-[color:var(--color-text-dim)] hover:text-[color:var(--color-red)] hover:bg-[color:var(--color-surface-2)] transition-colors"
                  >
                    <LogOut size={16} /> {t('nav.signOut')}
                  </button>
                </form>
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

function MobileQuickAddModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const t = useT();

  const options = [
    {
      href: '/receipts?open=new',
      icon: Receipt,
      color: 'var(--color-purple)',
      title: t('nav.scanReceipt'),
      desc: t('home.dReceipts'),
    },
    {
      href: '/expenses?open=new',
      icon: Wallet,
      color: 'var(--color-accent)',
      title: t('nav.addExpense'),
      desc: t('ex.balancesEmpty'),
    },
    {
      href: '/shopping-list?open=new',
      icon: ShoppingBasket,
      color: 'var(--color-gold)',
      title: t('nav.addShoppingItem'),
      desc: t('home.dShoppingList'),
    },
  ];

  return (
    <Modal open={open} onClose={onClose} title={t('nav.quickAdd')} size="sm">
      <div className="space-y-2.5 py-1">
        {options.map((opt) => {
          const Icon = opt.icon;
          return (
            <Link
              key={opt.href}
              href={opt.href}
              onClick={onClose}
              className="flex items-center gap-3.5 p-3 rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] hover:bg-[color:var(--color-surface-2)] hover:border-[color:var(--color-border-light)] transition-all group"
            >
              <div
                className="w-10 h-10 rounded-xl grid place-items-center shrink-0"
                style={{
                  color: opt.color,
                  background: `color-mix(in srgb, ${opt.color} 15%, transparent)`,
                }}
              >
                <Icon size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-[color:var(--color-text)] group-hover:text-[color:var(--color-accent)] transition-colors">
                  {opt.title}
                </p>
                <p className="text-xs text-[color:var(--color-text-dim)] truncate">{opt.desc}</p>
              </div>
              <ArrowRight size={16} className="text-[color:var(--color-text-faint)] group-hover:text-[color:var(--color-text)] shrink-0 transition-colors" />
            </Link>
          );
        })}
      </div>
    </Modal>
  );
}

export function SiteNav({ aiReady = false, user }: { aiReady?: boolean; user?: SessionUser }) {
  const t = useT();
  const pathname = usePathname();

  const [notifOpen, setNotifOpen] = useState(false);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);

  // Active states for bottom tab bar
  const isHomeActive = pathname === '/';
  const isMoneyActive = MONEY_LINKS.some((l) => navActive(pathname, l.href));
  const isCalendarActive = navActive(pathname, '/calendar');
  const isMoreActive =
    mobileMoreOpen ||
    (!isHomeActive && !isMoneyActive && !isCalendarActive);

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-[color:var(--color-border)] bg-[color:var(--color-bg)]">
        <div className="max-w-[1400px] mx-auto px-4 py-2.5 flex items-center gap-3">
          {/* Logo */}
          <Link
            href={'/'}
            prefetch={false}
            title="PHAROS · Personal Hub · Asset & Resource Oversight System"
            className="flex items-center gap-2 shrink-0 hover:opacity-80 transition-opacity"
          >
            <PharosMark size={22} className="text-[color:var(--color-accent)] shrink-0" />
            <span
              className="hidden sm:inline tracking-[0.14em] uppercase"
              style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}
            >
              Pharos
            </span>
          </Link>

          {/* Central command bar */}
          <div className="flex-1 flex justify-center min-w-0">
            <AiCommandBar />
          </div>

          {/* Grouped links (desktop) */}
          <nav className="hidden lg:flex items-center gap-0.5 shrink-0">
            <Link
              href="/"
              prefetch={false}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium transition-all',
                pathname === '/'
                  ? 'text-[color:var(--color-accent)]'
                  : 'text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)] hover:bg-[color:var(--color-surface)]'
              )}
            >
              <Home size={15} />
              {t('nav.home')}
            </Link>
            {NAV_GROUPS.map((g) => (
              <NavGroupDropdown key={g.key} group={g} />
            ))}
          </nav>

          {/* Right actions */}
          <div className="flex items-center gap-1 shrink-0">
            <span
              className={cn(
                'hidden sm:flex items-center gap-1.5 text-[11px] mr-1',
                aiReady ? 'text-[color:var(--color-accent)]' : 'text-[color:var(--color-text-faint)]'
              )}
              style={{ fontFamily: 'var(--font-mono)' }}
              title={aiReady ? t('ai.reachable') : t('ai.notConfigured')}
            >
              <span
                className={cn('h-1.5 w-1.5 rounded-full', aiReady ? 'bg-[color:var(--color-accent)]' : 'bg-[color:var(--color-text-faint)]')}
              />
              {aiReady ? t('ai.online') : t('ai.offline')}
            </span>
            {user && <NotificationBell open={notifOpen} onOpenChange={setNotifOpen} />}
            {user && <UserMenu user={user} />}
          </div>
        </div>
      </header>

      {/* Mobile bottom tab bar (#368) */}
      <nav
        aria-label="Mobile navigation"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-[color:var(--color-bg)]/95 backdrop-blur-md border-t border-[color:var(--color-border)] px-2 pt-1 pb-[max(0.35rem,env(safe-area-inset-bottom))] flex items-center justify-around shadow-lg"
      >
        <Link
          href="/"
          prefetch={false}
          className={cn(
            'flex-1 flex flex-col items-center justify-center gap-0.5 py-1 px-1 rounded-lg text-[10px] font-medium transition-colors min-w-0',
            isHomeActive
              ? 'text-[color:var(--color-accent)] font-semibold'
              : 'text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)]'
          )}
        >
          <Home size={19} />
          <span className="truncate">{t('nav.home')}</span>
        </Link>

        <Link
          href="/expenses"
          prefetch={false}
          className={cn(
            'flex-1 flex flex-col items-center justify-center gap-0.5 py-1 px-1 rounded-lg text-[10px] font-medium transition-colors min-w-0',
            isMoneyActive
              ? 'text-[color:var(--color-accent)] font-semibold'
              : 'text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)]'
          )}
        >
          <Wallet size={19} />
          <span className="truncate">{t('nav.money')}</span>
        </Link>

        {/* Center Quick Add action */}
        <button
          type="button"
          onClick={() => setQuickAddOpen(true)}
          aria-label={t('nav.quickAdd')}
          className="flex-1 flex flex-col items-center justify-center gap-0.5 py-1 px-1 text-[10px] font-medium text-[color:var(--color-accent)] group"
        >
          <div className="w-8 h-8 rounded-full bg-[color:var(--color-accent)] text-[color:var(--color-bg)] flex items-center justify-center shadow-md active:scale-95 group-hover:brightness-110 transition-all">
            <Plus size={18} strokeWidth={2.5} />
          </div>
          <span className="truncate">{t('nav.quickAdd')}</span>
        </button>

        <Link
          href="/calendar"
          prefetch={false}
          className={cn(
            'flex-1 flex flex-col items-center justify-center gap-0.5 py-1 px-1 rounded-lg text-[10px] font-medium transition-colors min-w-0',
            isCalendarActive
              ? 'text-[color:var(--color-accent)] font-semibold'
              : 'text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)]'
          )}
        >
          <CalendarDays size={19} />
          <span className="truncate">{t('nav.calendar')}</span>
        </Link>

        <button
          type="button"
          onClick={() => setMobileMoreOpen(true)}
          aria-label={t('nav.more')}
          className={cn(
            'flex-1 flex flex-col items-center justify-center gap-0.5 py-1 px-1 rounded-lg text-[10px] font-medium transition-colors min-w-0',
            isMoreActive
              ? 'text-[color:var(--color-accent)] font-semibold'
              : 'text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)]'
          )}
        >
          <Menu size={19} />
          <span className="truncate">{t('nav.more')}</span>
        </button>
      </nav>

      {/* Mobile More Sheet */}
      <MobileMoreSheet
        open={mobileMoreOpen}
        onClose={() => setMobileMoreOpen(false)}
        user={user}
      />

      {/* Mobile Quick Add Modal */}
      <MobileQuickAddModal
        open={quickAddOpen}
        onClose={() => setQuickAddOpen(false)}
      />
    </>
  );
}
