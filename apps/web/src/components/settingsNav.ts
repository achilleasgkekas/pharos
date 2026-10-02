// Every Settings page and its place in the navigation, in one list (the redesign): the
// desktop sidebar shows it while you are in Settings, the phone shows it as the Settings
// index, and SettingsClient renders the page whose id is in ?tab=. One list, so the three can
// never disagree about which pages exist or who may see them.
import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  Bell,
  BellRing,
  CreditCard,
  Database,
  HardDrive,
  History,
  MessageSquareCode,
  Palette,
  Plug,
  Server,
  SlidersHorizontal,
  Sparkles,
  Store,
  Tags,
  TrendingDown,
  Upload,
  UserRound,
  Users,
} from 'lucide-react';
import type { TKey } from '@/lib/i18n';

export type SettingsTabId =
  | 'account'
  | 'appearance'
  | 'my-notifications'
  | 'general'
  | 'alerts'
  | 'categories'
  | 'stores'
  | 'cards'
  | 'ai'
  | 'scraper'
  | 'prompts'
  | 'storage'
  | 'backups'
  | 'import'
  | 'notifications'
  | 'integrations'
  | 'users'
  | 'activity'
  | 'system'
  | 'about';

export type SettingsTab = {
  id: SettingsTabId;
  label: TKey;
  desc: TKey;
  icon: LucideIcon;
  adminOnly?: boolean;
  /** Only once there is a second account: on a single-user install there is nobody else. */
  multiUserOnly?: boolean;
};

export const SETTINGS_GROUPS: { label: TKey; tabs: SettingsTab[] }[] = [
  {
    label: 'set.grpYou',
    tabs: [
      { id: 'account', label: 'set.tabAccount', desc: 'set.descAccount', icon: UserRound },
      { id: 'appearance', label: 'set.tabAppearance', desc: 'set.descAppearance', icon: Palette },
      { id: 'my-notifications', label: 'set.tabMyNotifications', desc: 'set.descMyNotifications', icon: BellRing },
    ],
  },
  {
    label: 'set.grpWorkspace',
    tabs: [
      { id: 'general', label: 'set.tabGeneral', desc: 'set.descGeneral', icon: SlidersHorizontal },
      { id: 'alerts', label: 'set.tabAlerts', desc: 'set.descAlerts', icon: Bell },
      { id: 'categories', label: 'set.tabCategories', desc: 'set.descCategories', icon: Tags },
      { id: 'stores', label: 'set.tabStores', desc: 'set.descStores', icon: Store },
      { id: 'cards', label: 'set.tabCards', desc: 'set.descCards', icon: CreditCard },
    ],
  },
  {
    label: 'set.grpAi',
    tabs: [
      { id: 'ai', label: 'set.tabAiFeatures', desc: 'set.descAi', icon: Sparkles },
      { id: 'scraper', label: 'set.tabScraper', desc: 'set.descScraper', icon: TrendingDown },
      { id: 'prompts', label: 'set.tabPrompts', desc: 'set.descPrompts', icon: MessageSquareCode },
    ],
  },
  {
    label: 'set.grpData',
    tabs: [
      { id: 'storage', label: 'set.tabFileStorage', desc: 'set.descStorage', icon: HardDrive },
      { id: 'backups', label: 'set.tabBackups', desc: 'set.descBackups', icon: Database },
      { id: 'import', label: 'set.tabImport', desc: 'set.descImport', icon: Upload },
    ],
  },
  {
    label: 'set.grpConnect',
    tabs: [
      { id: 'notifications', label: 'set.tabChannels', desc: 'set.descChannels', icon: Bell },
      { id: 'integrations', label: 'set.tabIntegrations', desc: 'set.descIntegrations', icon: Plug },
    ],
  },
  {
    label: 'set.grpAdmin',
    tabs: [
      { id: 'users', label: 'set.tabUsersAccess', desc: 'set.descUsers', icon: Users, adminOnly: true },
      // P89 (#23): who added or trashed what. Every role may read it.
      { id: 'activity', label: 'set.tabActivity', desc: 'set.descActivity', icon: History, multiUserOnly: true },
      // P77: host-level numbers (Mongo latency, volume free space, job queue).
      { id: 'system', label: 'set.tabSystem', desc: 'set.descSystem', icon: Activity, adminOnly: true },
      { id: 'about', label: 'set.tabAbout', desc: 'set.descAbout', icon: Server },
    ],
  },
];

export const ALL_SETTINGS_TABS: SettingsTab[] = SETTINGS_GROUPS.flatMap((g) => g.tabs);

/** The groups and pages this person may open. */
export function visibleSettingsGroups(opts: { isAdmin: boolean; multiUser: boolean }) {
  return SETTINGS_GROUPS.map((g) => ({
    ...g,
    tabs: g.tabs.filter((t) => (!t.adminOnly || opts.isAdmin) && (!t.multiUserOnly || opts.multiUser)),
  })).filter((g) => g.tabs.length > 0);
}

/** A ?tab= value, old ids included (links, bookmarks, a saved last tab), as a page id. */
export function normalizeSettingsTab(raw: string | null | undefined): SettingsTabId | null {
  if (!raw) return null;
  if (ALL_SETTINGS_TABS.some((t) => t.id === raw)) return raw as SettingsTabId;
  const ALIASES: Record<string, SettingsTabId> = {
    workspace: 'general',
    profile: 'account',
    money: 'general',
    data: 'stores',
    budget: 'general',
    theme: 'appearance',
    language: 'appearance',
  };
  return ALIASES[raw] ?? null;
}

export function settingsHref(id: SettingsTabId): string {
  return `/settings?tab=${id}`;
}
