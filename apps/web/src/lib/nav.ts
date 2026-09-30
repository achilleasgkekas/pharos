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
  UserRound,
} from 'lucide-react';

export type NavItem = {
  href: string;
  key: TKey;
  icon: LucideIcon;
};

export type NavGroup = {
  key: TKey;
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

export const ACCOUNT_LINKS: NavItem[] = [
  { href: '/account', key: 'nav.account', icon: UserRound },
  { href: '/settings', key: 'nav.settings', icon: Settings },
  { href: '/jobs', key: 'nav.jobs', icon: Activity },
  { href: '/history', key: 'nav.history', icon: MessageSquare },
  { href: '/trash', key: 'nav.trash', icon: Trash2 },
];

export const NAV_GROUPS: NavGroup[] = [
  { key: 'nav.money', links: MONEY_LINKS },
  { key: 'nav.shopping', links: SHOPPING_LINKS },
  { key: 'nav.homeAndCar', links: HOME_AND_CAR_LINKS },
  { key: 'nav.planner', links: PLANNER_LINKS },
];

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
