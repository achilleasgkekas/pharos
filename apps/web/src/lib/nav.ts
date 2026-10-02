import type { TKey } from '@/lib/i18n';
import type { LucideIcon } from 'lucide-react';
import {
  Home,
  Wallet,
  Banknote,
  Receipt,
  FileText,
  CalendarClock,
  CreditCard,
  PiggyBank,
  BarChart3,
  ShoppingBasket,
  ShoppingCart,
  Ticket,
  Package,
  Gauge,
  Car,
  IdCard,
  CalendarDays,
  CheckSquare,
  Cake,
  Settings,
  Activity,
  MessageSquare,
  Trash2,
  Sofa,
} from 'lucide-react';

export type NavItem = {
  href: string;
  key: TKey;
  icon: LucideIcon;
};

export type NavGroup = {
  key: TKey;
  /** The label of the group's tab in the phone's section bar, where space is tight. */
  shortKey: TKey;
  icon: LucideIcon;
  links: NavItem[];
};

export const HOME_ITEM: NavItem = {
  href: '/',
  key: 'nav.home',
  icon: Home,
};

export const MONEY_LINKS: NavItem[] = [
  { href: '/expenses', key: 'nav.expenses', icon: Wallet },
  { href: '/income', key: 'nav.income', icon: Banknote },
  { href: '/receipts', key: 'nav.receipts', icon: Receipt },
  { href: '/bills', key: 'nav.bills', icon: FileText },
  { href: '/subscriptions', key: 'nav.subscriptions', icon: CalendarClock },
  { href: '/statements', key: 'nav.statements', icon: CreditCard },
  { href: '/savings', key: 'nav.savings', icon: PiggyBank },
  { href: '/reports', key: 'nav.reports', icon: BarChart3 },
];

export const SHOPPING_LINKS: NavItem[] = [
  { href: '/shopping-list', key: 'nav.shoppingList', icon: ShoppingBasket },
  { href: '/shopping', key: 'nav.wishlist', icon: ShoppingCart },
  { href: '/vouchers', key: 'nav.vouchers', icon: Ticket },
];

export const HOME_AND_CAR_LINKS: NavItem[] = [
  { href: '/items', key: 'nav.inventory', icon: Package },
  { href: '/utilities', key: 'nav.utilities', icon: Gauge },
  { href: '/vehicles', key: 'nav.vehicles', icon: Car },
  { href: '/documents', key: 'nav.documents', icon: IdCard },
];

export const PLANNER_LINKS: NavItem[] = [
  { href: '/calendar', key: 'nav.calendar', icon: CalendarDays },
  { href: '/tasks', key: 'nav.tasks', icon: CheckSquare },
  { href: '/special-dates', key: 'nav.specialDates', icon: Cake },
];

// Your account lives in Settings (Settings › You), so the account menu needs no own page.
export const ACCOUNT_LINKS: NavItem[] = [
  { href: '/settings', key: 'nav.settings', icon: Settings },
  { href: '/jobs', key: 'nav.jobs', icon: Activity },
  { href: '/history', key: 'nav.history', icon: MessageSquare },
  { href: '/trash', key: 'nav.trash', icon: Trash2 },
];

export const NAV_GROUPS: NavGroup[] = [
  { key: 'nav.money', shortKey: 'nav.money', icon: Wallet, links: MONEY_LINKS },
  { key: 'nav.shopping', shortKey: 'nav.shopping', icon: ShoppingBasket, links: SHOPPING_LINKS },
  { key: 'nav.homeAndCar', shortKey: 'nav.homeAndCarShort', icon: Sofa, links: HOME_AND_CAR_LINKS },
  { key: 'nav.planner', shortKey: 'nav.planner', icon: CalendarDays, links: PLANNER_LINKS },
];

/** The group a path belongs to, or null for Home and the pages outside the groups. */
export function navGroupOf(pathname: string): NavGroup | null {
  return NAV_GROUPS.find((g) => g.links.some((l) => navActive(pathname, l.href))) ?? null;
}

export const ALL_NAV_ITEMS: NavItem[] = [
  HOME_ITEM,
  ...MONEY_LINKS,
  ...SHOPPING_LINKS,
  ...HOME_AND_CAR_LINKS,
  ...PLANNER_LINKS,
  ...ACCOUNT_LINKS,
];

/** Segment-aware active match. */
export function navActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(href + '/');
}
