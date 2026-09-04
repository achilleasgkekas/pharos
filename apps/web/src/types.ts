export type SerializedPriceEntry = {
  _id: string;
  price: number;
  store: string;
  url: string;
  currency: string;
  date: string;
  inStock: boolean;
};

export type SerializedAttachment = {
  path: string;
  name: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
};

export type SerializedItem = {
  _id: string;
  num: string;
  title: string;
  category: string;
  status: string;
  specs: string;
  notes: string;
  tags: string[];
  currentPrice: number;
  purchasedPrice: number | null;
  purchasedAt: string | null;
  purchasedFrom: string;
  targetPrice: number | null;
  /** P9: ISO code printed on the receipt; '' (or the base code) when the item is not foreign. */
  currency: string;
  /** P9: printed anchor price (paid, else asking); 0 when the item is in base currency. */
  origAmount: number;
  /** P9: base units per 1 unit of `currency`; 0 when not foreign or the rate is still unknown. */
  fxRate: number;
  priceHistory: SerializedPriceEntry[];
  links: { label: string; url: string; price?: number | null }[];
  receiptIds: string[];
  photos: string[];
  attachments: SerializedAttachment[];
  /** P55: resale bookkeeping, only meaningful on a `sold` item. `soldPrice` is ALWAYS
   *  base currency (a resale is its own transaction, not the original receipt's rate). */
  soldPrice: number | null;
  soldAt: string | null;
  soldTo: string;
  /** Id of the Expense(kind='income') already created from this sale, else null. */
  soldIncomeId: string | null;
  /** P72: parcel tracking while the item is `ordered`. `trackingUrl` is a manual override
   *  that wins over the carrier link pattern guessed in lib/tracking.ts. */
  trackingNumber: string;
  carrier: string;
  trackingUrl: string;
  /** P70: user-named attributes. May be absent on documents written before P70 — read it
   *  as `item.customFields ?? []`, lean queries do not fill schema defaults in. */
  customFields: { key: string; value: string }[];
  /** P41: periodic maintenance. `maintenanceIntervalDays` null = no schedule (every
   *  pre-P41 item); `lastMaintenanceAt` null = never serviced, so the purchase date
   *  is what the next due date counts from. See lib/maintenance.ts. */
  maintenanceIntervalDays: number | null;
  lastMaintenanceAt: string | null;
  warrantyUntil: string | null;
  serialNumber: string;
  location: string;
  aiFilledAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SerializedStep = {
  _id: string;
  text: string;
  done: boolean;
};

export type SerializedTask = {
  _id: string;
  title: string;
  description: string;
  content: string;
  steps: SerializedStep[];
  tags: string[];
  status: string;
  priority: string;
  num: string;
  dueDate: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SerializedLineItem = {
  _id: string;
  name: string;
  refinedName: string;
  qty: number;
  price: number;
  vatRate: number;
  category?: string; // P64: optional per-line spend category ('' / absent = untagged)
  matchedItemId: string | null;
};

export type SerializedReceipt = {
  _id: string;
  store: string;
  date: string;
  total: number;
  subtotal: number;
  vatAmount: number;
  warrantyMonths: number;
  // Multi-currency (P9, see lib/fx.ts): `total`/`subtotal`/`vatAmount` and the line
  // prices are ALWAYS in the deployment's base currency; a foreign receipt also keeps
  // the printed total + the rate used to convert it.
  currency: string;
  origAmount: number; // total as printed on the receipt; 0 when not foreign
  fxRate: number; // base units per 1 `currency` unit; 0 = unknown / not foreign
  paymentMethod: string;
  lineItems: SerializedLineItem[];
  itemIds: string[];
  filePath: string;
  fileType: string;
  thumbPath: string;
  fileSize: number;
  aiModel: string;
  aiParsedAt: string | null;
  verified: boolean;
  archived: boolean;
  notes: string;
  createdAt: string;
  updatedAt: string;
  // Computed (not stored): days left in the store's return window, set by the
  // receipts page when the purchase is still returnable. null/absent = window
  // closed, disabled, or unknown date.
  returnDaysLeft?: number | null;
};

export type SerializedExpense = {
  _id: string;
  kind: 'income' | 'expense';
  vendor: string;
  vendorKey: string;
  category: string;
  space: string; // per-property/context ledger tag (P34); '' = unassigned
  // Tax / deductible tagging (P8): taxDeductible gates inclusion in the year-end export,
  // taxCategory is a free-form (optionally preset) label used to group that export.
  taxDeductible: boolean;
  taxCategory: string;
  // Multi-currency (P9, see lib/fx.ts): `amount` is ALWAYS in the deployment's base
  // currency; a foreign entry also keeps the printed amount + the rate used.
  amount: number;
  currency: string;
  origAmount: number; // amount as printed on the document; 0 when not foreign
  fxRate: number; // base units per 1 `currency` unit; 0 = unknown / not foreign
  date: string;
  period: string;
  recurring: boolean;
  recurringCycle: import('@/lib/billingCycle').RecurringCycle;
  filePath: string;
  fileType: string;
  thumbPath: string;
  fileSize: number;
  paymentMethod: string;
  notes: string;
  // Expense splitting (P35): people who owe you a share of this expense.
  split: import('@/lib/split').SplitEntry[];
  // Payment-method split (P62): which of YOUR methods paid this one purchase.
  // Empty = paid with the single `paymentMethod` above (pre-P62 behaviour).
  paymentSplits: import('@/lib/paymentSplit').PaymentSplitEntry[];
  aiModel: string;
  aiParsedAt: string | null;
  verified: boolean;
  createdAt: string;
  updatedAt: string;
  // Computed (not stored): % deviation from the vendor-series median when unusual
  // (e.g. an electricity bill 2× the usual). Set by getExpenseData.
  anomaly?: number;
};

export type SerializedVoucher = {
  _id: string;
  title: string;
  code: string;
  store: string;
  discount: string;
  expiresAt: string | null;
  used: boolean;
  url: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type SerializedGiftCardUse = {
  _id: string;
  amount: number;
  date: string | null;
  note: string;
  // P62: non-empty when this use was mirrored from an expense's payment split.
  expenseId: string;
};

// P32 — gift-card / store-credit / prepaid with a decreasing monetary balance.
export type SerializedGiftCard = {
  _id: string;
  title: string;
  store: string;
  code: string;
  initialAmount: number;
  expiresAt: string | null;
  archived: boolean;
  notes: string;
  uses: SerializedGiftCardUse[];
  createdAt: string;
  updatedAt: string;
};

// P62 — the minimum a payment-split row needs in order to offer a gift card as one
// of the methods that paid a purchase: which card it is, and how much is still on it.
// The balance is computed server-side so the expenses page never ships whole `uses[]`
// histories just to render a picker.
export type GiftCardOption = { _id: string; title: string; store: string; balance: number };

// P20 — loyalty/membership card wallet entry (no monetary balance, unlike GiftCard).
export type SerializedLoyaltyCard = {
  _id: string;
  title: string;
  store: string;
  cardNumber: string;
  barcodeFormat: string;
  notes: string;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
};

// P28 — a manually-paid bill/payable whose status (paid/overdue/due-soon) is derived.
export type SerializedBill = {
  _id: string;
  title: string;
  vendor: string;
  amount: number;
  /** P9: `amount` is always base currency; these carry the printed figure + rate (0 = not foreign). */
  currency?: string;
  origAmount?: number;
  fxRate?: number;
  dueDate: string | null;
  paidAt: string | null;
  /** P61: optional manual instalments, base-currency. Empty = plain binary bill. */
  payments?: { _id: string; amount: number; date: string | null; note: string; expenseId: string }[];
  category: string;
  cycle: import('@/lib/billingCycle').RecurringCycle;
  notes: string;
  archived: boolean;
  linkedExpenseId: string;
  createdAt: string;
  updatedAt: string;
};

export type SerializedCard = {
  _id: string;
  name: string;
  last4: string;
  bank: string;
  kind: string;
  type: string;
  color: string;
  creditLimit: number;
  notes: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SerializedSubscription = {
  _id: string;
  name: string;
  provider: string;
  category: string;
  amount: number;
  currency: string;
  /** P9: printed figure on a foreign-currency invoice; 0 when the sub is in base currency. */
  origAmount: number;
  /** P9: base units per 1 unit of `currency`; 0 when not foreign or still unknown. */
  fxRate: number;
  billingCycle: string;
  startDate: string;
  nextRenewal: string | null;
  trialEndsAt: string | null;
  firstChargeAmount: number;
  cancelledAt: string | null;
  active: boolean;
  paymentMethod: string;
  notes: string;
  url: string;
  // Recurring cost-split among household members (P73): same shape as Expense.split.
  split: import('@/lib/split').SplitEntry[];
  createdAt: string;
  updatedAt: string;
};

export type SerializedTransaction = {
  _id: string;
  date: string;
  description: string;
  amount: number;
  category: string;
  installmentInfo: {
    currentInstallment: number;
    totalInstallments: number;
    originalPurchase: string;
    // Manual override: when set, this charge groups into the named plan regardless
    // of its (differently-worded) description. Set by "merge into another plan".
    planKey?: string | null;
  } | null;
  matchedItemIds: string[];
  matchedReceiptId: string | null;
};

export type SerializedStatement = {
  _id: string;
  card: string;
  last4: string;
  cardId: string | null;
  period: string;
  statementDate: string;
  dueDate: string | null;
  totalAmount: number;
  minimumPayment: number;
  paidAmount: number;
  // P9: `currency` is what the statement PRINTS; every amount above (and each
  // transaction) is stored in base currency, converted with this one `fxRate`.
  // `origAmount` is the printed headline total. 0 rate = not foreign, or no rate yet.
  currency: string;
  origAmount?: number;
  fxRate?: number;
  transactions: SerializedTransaction[];
  filePath: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type SerializedPhase = {
  _id: string;
  num: string;
  title: string;
  content: string;
  notes: string;
  status: string;
  estimatedHours: number;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};
