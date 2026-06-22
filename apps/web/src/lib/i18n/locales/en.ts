// English is the SOURCE locale: it defines every translation key. Other locales
// are Partial<Dict> and fall back to these strings for anything they omit.
export const en = {
  // ── Navbar groups + links ───────────────────────────────────────────────
  'nav.stuff': 'Stuff',
  'nav.money': 'Money',
  'nav.plan': 'Plan',
  'nav.activity': 'Activity',
  'nav.inventory': 'Inventory',
  'nav.shopping': 'Shopping',
  'nav.receipts': 'Receipts',
  'nav.expenses': 'Expenses',
  'nav.income': 'Income',
  'nav.statements': 'Statements',
  'nav.subscriptions': 'Subscriptions',
  'nav.vouchers': 'Vouchers',
  'nav.calendar': 'Calendar',
  'nav.tasks': 'Tasks',
  'nav.reports': 'Reports',
  'nav.jobs': 'Jobs',
  'nav.history': 'AI history',
  'nav.trash': 'Trash',
  'nav.settings': 'Settings',
  'nav.account': 'Account',
  'nav.signOut': 'Sign out',

  // ── Command bar ──────────────────────────────────────────────────────────
  'bar.searchPlaceholder': 'Search everything…  receipts, items, tasks',
  'bar.aiPlaceholder': 'Ask Pharos…  add a subscription, show stats',
  'bar.searchTitle': 'Search your data',
  'bar.aiTitle': 'Ask the AI',
  'bar.try': 'Try',
  'bar.noMatches': 'No matches',
  'bar.searching': 'Searching…',
  'bar.thinking': 'thinking…',
  'bar.newConversation': 'New conversation',
  'ai.online': 'AI online',
  'ai.offline': 'AI offline',
  'ai.reachable': 'AI is reachable',
  'ai.notConfigured': 'AI offline / not configured',

  // ── Common actions / words ───────────────────────────────────────────────
  'common.save': 'Save',
  'common.cancel': 'Cancel',
  'common.delete': 'Delete',
  'common.deleteForever': 'Delete forever',
  'common.edit': 'Edit',
  'common.new': 'New',
  'common.add': 'Add',
  'common.search': 'Search',
  'common.close': 'Close',
  'common.back': 'Back',
  'common.restore': 'Restore',
  'common.refresh': 'Refresh',
  'common.confirm': 'Confirm',
  'common.continue': 'Continue',
  'common.skip': 'Skip',
  'common.loading': 'Loading…',
  'common.all': 'All',
  'common.none': 'None',
  'common.selectAll': 'Select all',
  'common.deselectAll': 'Deselect all',
  'common.cannotUndo': 'This cannot be undone.',

  // ── Language switcher ────────────────────────────────────────────────────
  'lang.language': 'Language',
} as const;

export type Dict = Record<keyof typeof en, string>;
export type TKey = keyof typeof en;
