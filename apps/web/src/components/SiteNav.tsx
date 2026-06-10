'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useRef, useEffect } from 'react';
import {
  Package, ShoppingCart, CheckSquare, Receipt as ReceiptIcon, CalendarClock, CreditCard,
  Menu, X, Sun, Moon, Settings, BarChart3, Ticket, Wallet, Banknote, ChevronDown, Wifi,
} from 'lucide-react';
import { cn } from './ui/cn';
import { useTheme } from './ThemeProvider';
import { PharosMark } from './PharosMark';
import { AiCommandBar } from './AiCommandBar';

type NavLink = { href: string; label: string; icon: typeof Package };

const STUFF: NavLink[] = [
  { href: '/items', label: 'Inventory', icon: Package },
  { href: '/shopping', label: 'Shopping', icon: ShoppingCart },
];
const MONEY: NavLink[] = [
  { href: '/receipts', label: 'Receipts', icon: ReceiptIcon },
  { href: '/expenses', label: 'Expenses', icon: Wallet },
  { href: '/income', label: 'Income', icon: Banknote },
  { href: '/statements', label: 'Statements', icon: CreditCard },
  { href: '/subscriptions', label: 'Subscriptions', icon: CalendarClock },
  { href: '/vouchers', label: 'Vouchers', icon: Ticket },
];
const PLAN: NavLink[] = [
  { href: '/tasks', label: 'Tasks', icon: CheckSquare },
  { href: '/reports', label: 'Reports', icon: BarChart3 },
  { href: '/network', label: 'Network', icon: Wifi },
];
const GROUPS: { label: string; links: NavLink[] }[] = [
  { label: 'Stuff', links: STUFF },
  { label: 'Money', links: MONEY },
  { label: 'Plan', links: PLAN },
];
const ALL_LINKS = [...STUFF, ...MONEY, ...PLAN];

function NavGroup({ label, links }: { label: string; links: NavLink[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = links.some((l) => pathname.startsWith(l.href));
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
        {label}
        <ChevronDown size={13} className={cn('transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 min-w-44 rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] shadow-2xl shadow-black/40 p-1">
          {links.map((l) => {
            const Icon = l.icon;
            const isActive = pathname.startsWith(l.href);
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
                <Icon size={15} /> {l.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function SiteNav({ aiReady = false }: { aiReady?: boolean }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { theme, toggle } = useTheme();

  return (
    <header className="sticky top-0 z-40 border-b border-[color:var(--color-border)] bg-[color:var(--color-bg)]/90 backdrop-blur-xl">
      <div className="max-w-[1500px] mx-auto px-4 py-2.5 flex items-center gap-3">
        {/* Logo */}
        <Link href="/" prefetch={false} title="PHAROS · Personal Hub · Asset & Resource Oversight System" className="flex items-center gap-2 shrink-0 hover:opacity-80 transition-opacity">
          <PharosMark size={22} className="text-[color:var(--color-accent)] shrink-0" />
          <span className="hidden sm:inline tracking-[0.14em] uppercase" style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}>
            Pharos
          </span>
        </Link>

        {/* Central command bar */}
        <div className="flex-1 flex justify-center min-w-0">
          <AiCommandBar placeholder="Ask Pharos…  add a subscription, show stats" />
        </div>

        {/* Grouped links (desktop) */}
        <nav className="hidden lg:flex items-center gap-0.5 shrink-0">
          {GROUPS.map((g) => (
            <NavGroup key={g.label} label={g.label} links={g.links} />
          ))}
        </nav>

        {/* Right actions */}
        <div className="flex items-center gap-1 shrink-0">
          <span
            className={cn('hidden sm:flex items-center gap-1.5 text-[11px] mr-1', aiReady ? 'text-[color:var(--color-accent)]' : 'text-[color:var(--color-text-faint)]')}
            style={{ fontFamily: 'var(--font-mono)' }}
            title={aiReady ? 'AI is reachable' : 'AI offline / not configured'}
          >
            <span className={cn('h-1.5 w-1.5 rounded-full', aiReady ? 'bg-[color:var(--color-accent)]' : 'bg-[color:var(--color-text-faint)]')} />
            AI {aiReady ? 'online' : 'offline'}
          </span>
          <button onClick={toggle} className="p-2 rounded-lg text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)] hover:bg-[color:var(--color-surface)] transition-colors" aria-label="Toggle theme">
            {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          <Link
            href="/settings"
            prefetch={false}
            className={cn('p-2 rounded-lg transition-colors', pathname.startsWith('/settings') ? 'text-[color:var(--color-accent)]' : 'text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)] hover:bg-[color:var(--color-surface)]')}
            aria-label="Settings"
          >
            <Settings size={17} />
          </Link>
          <button onClick={() => setMobileOpen((v) => !v)} className="lg:hidden p-2 rounded-lg text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)] hover:bg-[color:var(--color-surface)] transition-colors" aria-label="Menu">
            {mobileOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      {/* Mobile menu — all links */}
      {mobileOpen && (
        <nav className="lg:hidden border-t border-[color:var(--color-border)] px-4 py-2 grid grid-cols-2 sm:grid-cols-3 gap-1">
          {ALL_LINKS.map((link) => {
            const active = pathname.startsWith(link.href);
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                prefetch={false}
                onClick={() => setMobileOpen(false)}
                className={cn('flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-all', active ? 'bg-[color:var(--color-surface-2)] text-[color:var(--color-accent)]' : 'text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)]')}
              >
                <Icon size={16} /> {link.label}
              </Link>
            );
          })}
        </nav>
      )}
    </header>
  );
}
