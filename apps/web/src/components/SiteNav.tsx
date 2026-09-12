'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Package, ShoppingCart, ShoppingBasket, CheckSquare, Receipt as ReceiptIcon, CalendarClock, CreditCard,
  Menu, X, Sun, Moon, Settings, BarChart3, Ticket, Wallet, Banknote, ChevronDown, CalendarDays, PiggyBank,
  LogOut, UserRound, Activity, MessageSquare, Trash2, FileText, Building2, ShieldCheck, IdCard,
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

import type { Role } from '@/lib/roles';

type SessionUser = { name: string; role: Role };

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
  { href: '/documents', key: 'nav.documents', icon: IdCard },
  { href: '/savings', key: 'nav.savings', icon: PiggyBank },
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

/** Product-scoped links are plain relative paths ('/items', '/settings', ...) that only
 *  resolve on a TENANT host. When SiteNav renders somewhere else (app.<domain> — /admin,
 *  /account/*, `productBaseUrl` set), prefix with the account's home workspace's own
 *  subdomain instead so the link actually goes somewhere, rather than bouncing through the
 *  no_tenant gate back to /account/workspace. See the root layout's comment for the story. */
function productHref(base: string | undefined, path: string): string {
  return base ? `${base}${path}` : path;
}

function NavGroup({ groupKey, links, base }: { groupKey: TKey; links: NavLink[]; base?: string }) {
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
                href={productHref(base, l.href)}
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

function UserMenu({ user, saas, operator, base }: { user: SessionUser; saas: boolean; operator: boolean; base?: string }) {
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
  const menuRow = 'w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)] hover:bg-[color:var(--color-surface-2)] transition-colors';
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

          {/* Settings / language / appearance. Used to live as standalone icons in the top bar —
              moved here so the bar itself stays uncluttered and these read as "about how I use
              Pharos" rather than competing with the product navigation for space. */}
          <Link
            href={productHref(base, '/settings')}
            prefetch={false}
            onClick={() => setOpen(false)}
            className={cn(menuRow, pathname.startsWith('/settings') && 'text-[color:var(--color-accent)]')}
          >
            <Settings size={15} /> {t('nav.settings')}
          </Link>
          <div className="px-1">
            <LanguageSwitcher variant="row" />
          </div>
          <button type="button" onClick={toggle} className={menuRow}>
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
            {theme === 'dark' ? t('nav.lightMode') : t('nav.darkMode')}
          </button>

          {/* The way back out of a workspace.
              A hosted customer lands straight inside their workspace after login (one
              membership skips the chooser), and from there the product had no route to the
              account area at all: no billing, no members, no other workspace, nothing.
              Reported as "once I pick another page I do not know how to get back". The
              account menu is where a user already looks for it. */}
          {saas && (
            <>
              <div className="my-1 border-t border-[color:var(--color-border)]" />
              {/* /account/workspace, NOT /account. `/account` is a post-login ROUTER, not a
                  destination: with exactly one membership it redirects straight into the product
                  subdomain (see (saas)/account/page.tsx, deliberate). Right after login, wrong
                  from a menu — pressing "Workspaces & account" from inside the product bounced
                  you back to the page you were already on, so the item read as dead. Reported
                  live: "it gets me to the main page". /account/workspace is the real overview,
                  and it carries its own workspace switcher when there is more than one, so the
                  chooser is still one click away. */}
              {/* One entry to the workspace; Billing is a tab inside it (workspaceTabs), so a
                  second top-level Billing shortcut here was just the same destination twice. */}
              <Link href="/account/workspace" prefetch={false} onClick={() => setOpen(false)} className={menuRow}>
                <Building2 size={15} /> {t('nav.workspaces')}
              </Link>
              {/* Operator console. Only rendered for an account on the superadmin allowlist,
                  and the page re-checks that itself — this link is convenience, not the gate.
                  Without it the console was reachable only by typing /admin from memory. */}
              {operator && (
                <Link
                  href="/admin"
                  prefetch={false}
                  onClick={() => setOpen(false)}
                  className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm text-[color:var(--color-purple)] hover:bg-[color:var(--color-surface-2)] transition-colors"
                >
                  <ShieldCheck size={15} /> {t('nav.operator')}
                </Link>
              )}
            </>
          )}
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

export function SiteNav({ aiReady = false, user, saas = false, operator = false, productBaseUrl }: { aiReady?: boolean; user?: SessionUser; saas?: boolean; operator?: boolean; productBaseUrl?: string }) {
  const t = useT();
  const pathname = usePathname();
  // Single source of truth for "which absolute-positioned panel is open" — the mobile hamburger
  // menu and the notifications dropdown used to each own their own boolean and could both be
  // open at once, visually colliding on mobile (the notifications panel sitting on top of the
  // product link grid, screenshotted live 2026-08-05). Opening one now always closes the other.
  const [activePanel, setActivePanel] = useState<'none' | 'mobile' | 'notifications'>('none');
  const mobileOpen = activePanel === 'mobile';
  const notifOpen = activePanel === 'notifications';
  const toggleMobile = useCallback(() => setActivePanel((p) => (p === 'mobile' ? 'none' : 'mobile')), []);
  const setNotifOpen = useCallback((open: boolean) => setActivePanel(open ? 'notifications' : 'none'), []);

  // Solid bg on the sticky navbar (no backdrop-filter): a backdrop-filter here would
  // become the containing block for the AI spotlight's `fixed inset-0` backdrop and
  // clip it to the navbar's height instead of covering the whole viewport.
  return (
    <header className="sticky top-0 z-40 border-b border-[color:var(--color-border)] bg-[color:var(--color-bg)]">
      <div className="max-w-[1400px] mx-auto px-4 py-2.5 flex items-center gap-3">
        {/* Logo */}
        <Link href={productHref(productBaseUrl, '/')} prefetch={false} title="PHAROS · Personal Hub · Asset & Resource Oversight System" className="flex items-center gap-2 shrink-0 hover:opacity-80 transition-opacity">
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
            <NavGroup key={g.key} groupKey={g.key} links={g.links} base={productBaseUrl} />
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
          {user && <NotificationBell open={notifOpen} onOpenChange={setNotifOpen} />}
          {user && <UserMenu user={user} saas={saas} operator={operator} base={productBaseUrl} />}
          <button onClick={toggleMobile} className="lg:hidden p-2 rounded-lg text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)] hover:bg-[color:var(--color-surface)] transition-colors" aria-label="Menu">
            {mobileOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      {/* Mobile menu — all links.
          It carries its OWN opaque background on purpose. It used to have none at all and
          relied entirely on the header painting behind it, which is invisible until
          something breaks that assumption (a stale bundle, a stacking context above it, an
          ancestor that stops painting) — and then the open menu goes see-through with the
          page scrolling underneath it. Reported exactly that way on mobile. A panel that
          covers content should never depend on a parent for its own opacity.
          `max-h`+scroll keeps all 15 links reachable on a short phone. */}
      {mobileOpen && (
        <nav className="lg:hidden border-t border-[color:var(--color-border)] bg-[color:var(--color-bg)] max-h-[70vh] overflow-y-auto overscroll-contain px-4 py-2 grid grid-cols-2 sm:grid-cols-3 gap-1">
          {ALL_LINKS.map((link) => {
            const active = navActive(pathname, link.href);
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={productHref(productBaseUrl, link.href)}
                prefetch={false}
                onClick={() => setActivePanel('none')}
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
