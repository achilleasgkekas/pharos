// Client-SAFE AI feature registry (types + constants only — NO server imports, so
// client components like SettingsClient can import AI_FEATURES without dragging the
// server-only `ollama` package into the browser bundle). Server-side gating helpers
// live in ./aiFeatures.server.
export type AiFeatureKey =
  | 'receipts'
  | 'expenses'
  | 'statements'
  | 'statementCategorize'
  | 'vouchers'
  | 'cards'
  | 'subscriptions'
  | 'itemsImport'
  | 'commandBar';

export type AiFeatureStatus = 'disabled' | 'no-provider' | 'ready';

/** User-facing AI features, grouped by area, shown as toggles in Settings → AI. */
export const AI_FEATURES: { key: AiFeatureKey; label: string; description: string; area: string }[] = [
  { key: 'receipts', label: 'Receipt scanning', description: 'Auto-read store, date, items and totals from receipt photos & PDFs.', area: 'Documents' },
  { key: 'expenses', label: 'Bill & payslip scanning', description: 'Extract vendor, amount, date and category from bills and payslips.', area: 'Documents' },
  { key: 'statements', label: 'Statement parsing', description: 'Pull transactions and installments out of card-statement PDFs.', area: 'Documents' },
  { key: 'statementCategorize', label: 'Transaction auto-categorize', description: 'Suggest categories for statement transactions.', area: 'Documents' },
  { key: 'vouchers', label: 'Voucher scanning', description: 'Read code, discount and expiry from a coupon.', area: 'Documents' },
  { key: 'cards', label: 'Card photo scan', description: 'Read name, last-4 and bank from a photo of a payment card.', area: 'Documents' },
  { key: 'subscriptions', label: 'Subscription autofill', description: 'Fill provider, price and cycle from a subscription name.', area: 'Shopping & items' },
  { key: 'itemsImport', label: 'Product import & AI-fill', description: 'Import items from a URL and fill specs, price and photos.', area: 'Shopping & items' },
  { key: 'commandBar', label: 'AI command bar', description: 'Natural-language assistant in the top bar (add expenses, items, tasks…).', area: 'Assistant' },
];

export const AI_FEATURE_KEYS = AI_FEATURES.map((f) => f.key);

/** Message surfaced when AI is turned off entirely. */
export const AI_DISABLED_MESSAGE = 'AI is turned off. Enable it in Settings → AI.';
