'use client';
import { useState, useRef, useEffect, useCallback, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, Tag, ShieldCheck, CreditCard, TrendingUp, AlarmClock, Wallet, FileText, Wrench, Handshake, X } from 'lucide-react';
import { cn } from '@/components/ui/cn';
import { cur } from '@/lib/money';
import { useT } from '@/components/LocaleProvider';
import { relTime } from '@/lib/i18n/format';
import {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  dismissNotification,
  clearAllNotifications,
  type SerializedNotification,
  type NotifKind,
} from '@/app/notifications/actions';

const KIND_ICON: Record<NotifKind, typeof Bell> = { deal: Tag, warranty: ShieldCheck, installment: CreditCard, pricehike: TrendingUp, trialend: AlarmClock, giftcard: Wallet, bill: FileText, maintenance: Wrench, lending: Handshake, system: Bell };
const KIND_COLOR: Record<NotifKind, string> = {
  deal: 'var(--color-accent)',
  warranty: 'var(--color-gold)',
  installment: 'var(--color-cyan)',
  pricehike: 'var(--color-red)',
  trialend: 'var(--color-purple)',
  giftcard: 'var(--color-cyan)',
  bill: 'var(--color-gold)',
  maintenance: 'var(--color-cyan)',
  lending: 'var(--color-purple)',
  system: 'var(--color-text-dim)',
};

/** Navbar bell: in-app alerts (deals, warranties, installments due) with an
 *  unread badge. Polls every 60s; the server generates alerts on a throttle.
 *
 *  `open`/`onOpenChange` are controlled by SiteNav rather than local state — on mobile this
 *  dropdown and the hamburger nav menu are both `position: absolute` panels that used to open
 *  independently and visually collide (screenshotted: the notifications panel sitting on top
 *  of the product link grid). SiteNav now tracks a single "which panel is open" state and
 *  closes one when the other opens; this component just reports its own open/close intent up
 *  instead of owning the boolean itself. */
export function NotificationBell({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useT();
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  const [items, setItems] = useState<SerializedNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [, start] = useTransition();

  const refresh = useCallback(async () => {
    try {
      const r = await getNotifications();
      setItems(r.items);
      setUnread(r.unread);
    } catch {
      /* a poll failure shouldn't surface in the navbar */
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 60000);
    return () => clearInterval(id);
  }, [refresh]);

  // Only listen while this panel is actually open. `onOpenChange(false)` is SiteNav's
  // SHARED panel state ('none'), not a local boolean, so a dismiss fired while the bell is
  // closed does not close "nothing" — it closes whatever else is open. Unguarded, every
  // mousedown anywhere tore down the mobile nav menu, and since mousedown precedes click on
  // a tap, the link unmounted before the tap landed: the menu just blinked shut and never
  // navigated ("it's like not pressed, it minimizes it"). Reported on mobile, all pages.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onOpenChange(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onOpenChange(false);
    }
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onOpenChange]);

  // The stored `body` is a structured payload; localize it per viewer here.
  function describe(n: SerializedNotification): { heading: string; sub: string } {
    if (n.kind === 'deal') {
      const [lo, target] = n.body.split('|');
      return { heading: n.title, sub: t('notif.dealSub', { now: cur() + lo, target: cur() + target }) };
    }
    if (n.kind === 'warranty') return { heading: n.title, sub: t('notif.warrantySub', { days: n.body }) };
    if (n.kind === 'installment') {
      const [amount, count] = n.body.split('|');
      return { heading: t('notif.installmentHeading'), sub: t('notif.installmentSub', { amount: cur() + amount, n: count }) };
    }
    if (n.kind === 'pricehike') {
      const [prev, curr, pct] = n.body.split('|');
      const p = Number(pct);
      const key = p >= 0 ? 'notif.priceHikeSub' : 'notif.priceDropSub';
      return {
        heading: n.title,
        sub: t(key, { prev: cur() + prev, curr: cur() + curr, pct: `${p > 0 ? '+' : ''}${pct}%` }),
      };
    }
    if (n.kind === 'trialend') {
      const [days, amount] = n.body.split('|');
      const key = Number(days) <= 0 ? 'notif.trialTodaySub' : 'notif.trialSub';
      return { heading: n.title, sub: t(key, { days, amount: cur() + amount }) };
    }
    if (n.kind === 'giftcard') {
      const [days, balance] = n.body.split('|');
      const key = Number(days) <= 0 ? 'notif.giftcardTodaySub' : 'notif.giftcardSub';
      return { heading: n.title, sub: t(key, { days, balance: cur() + balance }) };
    }
    if (n.kind === 'bill') {
      const [days, amount] = n.body.split('|');
      const d = Number(days);
      const key = d < 0 ? 'notif.billOverdueSub' : d === 0 ? 'notif.billTodaySub' : 'notif.billDueSub';
      return { heading: n.title, sub: t(key, { days: Math.abs(d), amount: cur() + amount }) };
    }
    if (n.kind === 'maintenance') {
      const d = Number(n.body);
      const key = d < 0 ? 'notif.maintenanceOverdueSub' : d === 0 ? 'notif.maintenanceTodaySub' : 'notif.maintenanceSub';
      return { heading: n.title, sub: t(key, { days: Math.abs(d) }) };
    }
    if (n.kind === 'lending') {
      // body = "<days>|<borrower>"; split on the first bar only, a name may contain one.
      const bar = n.body.indexOf('|');
      const d = Number(bar < 0 ? n.body : n.body.slice(0, bar));
      const name = bar < 0 ? '' : n.body.slice(bar + 1);
      const key = d < 0 ? 'notif.lendingOverdueSub' : d === 0 ? 'notif.lendingTodaySub' : 'notif.lendingSub';
      return { heading: n.title, sub: t(key, { days: Math.abs(d), name }) };
    }
    return { heading: n.title, sub: n.body };
  }

  function openItem(n: SerializedNotification) {
    onOpenChange(false);
    if (!n.read) {
      setItems((p) => p.map((x) => (x._id === n._id ? { ...x, read: true } : x)));
      setUnread((u) => Math.max(0, u - 1));
      start(() => void markNotificationRead(n._id));
    }
    if (n.href) router.push(n.href);
  }
  function dismiss(e: React.MouseEvent, n: SerializedNotification) {
    e.stopPropagation();
    setItems((p) => p.filter((x) => x._id !== n._id));
    if (!n.read) setUnread((u) => Math.max(0, u - 1));
    start(() => void dismissNotification(n._id));
  }
  function markAll() {
    setItems((p) => p.map((x) => ({ ...x, read: true })));
    setUnread(0);
    start(() => void markAllNotificationsRead());
  }
  function clearAll() {
    setItems([]);
    setUnread(0);
    start(() => void clearAllNotifications());
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => {
          onOpenChange(!open);
          if (!open) refresh();
        }}
        className={cn(
          'relative p-2 rounded-lg transition-colors',
          open ? 'text-[color:var(--color-accent)] bg-[color:var(--color-surface)]' : 'text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)] hover:bg-[color:var(--color-surface)]'
        )}
        aria-label={t('notif.title')}
        title={t('notif.title')}
      >
        <Bell size={17} />
        {unread > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 grid place-items-center rounded-full bg-[color:var(--color-accent)] text-black text-[9px] font-bold"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-[340px] max-w-[92vw] z-50 rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] shadow-2xl shadow-black/40 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-[color:var(--color-border)]">
            <span className="text-xs font-semibold" style={{ fontFamily: 'var(--font-display)' }}>
              {t('notif.title')}
            </span>
            {items.length > 0 && (
              <div className="flex items-center gap-2.5">
                {unread > 0 && (
                  <button onClick={markAll} className="text-[10px] text-[color:var(--color-cyan)] hover:underline">
                    {t('notif.markAllRead')}
                  </button>
                )}
                <button onClick={clearAll} className="text-[10px] text-[color:var(--color-text-faint)] hover:text-[color:var(--color-red)]">
                  {t('notif.clearAll')}
                </button>
              </div>
            )}
          </div>

          <div className="max-h-[60vh] overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-4 py-8 text-center text-xs text-[color:var(--color-text-faint)]">{t('notif.empty')}</p>
            ) : (
              items.map((n) => {
                const Icon = KIND_ICON[n.kind] ?? Bell;
                const { heading, sub } = describe(n);
                return (
                  <div
                    key={n._id}
                    role="button"
                    tabIndex={0}
                    onClick={() => openItem(n)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') openItem(n);
                    }}
                    className={cn(
                      'group w-full text-left flex items-start gap-2.5 px-3 py-2.5 border-b border-[color:var(--color-border)] last:border-0 cursor-pointer transition-colors hover:bg-[color:var(--color-surface-2)] outline-none focus-visible:bg-[color:var(--color-surface-2)]',
                      !n.read && 'bg-[color:var(--color-accent)]/[0.05]'
                    )}
                  >
                    {!n.read ? (
                      <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-[color:var(--color-accent)] shrink-0" />
                    ) : (
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0" />
                    )}
                    <Icon size={15} className="mt-0.5 shrink-0" style={{ color: KIND_COLOR[n.kind] }} />
                    <span className="min-w-0 flex-1">
                      {heading && <span className="block text-sm font-medium truncate">{heading}</span>}
                      <span className="block text-xs text-[color:var(--color-text-dim)] truncate">{sub}</span>
                      <span className="block text-[10px] text-[color:var(--color-text-faint)] mt-0.5" style={{ fontFamily: 'var(--font-mono)' }}>
                        {relTime(n.createdAt, t)}
                      </span>
                    </span>
                    <button
                      onClick={(e) => dismiss(e, n)}
                      className="shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100 text-[color:var(--color-text-faint)] hover:text-[color:var(--color-red)] transition-all"
                      aria-label={t('notif.clearAll')}
                    >
                      <X size={13} />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
