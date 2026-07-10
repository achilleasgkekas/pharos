export type SerializedPriceEntry = {
  _id: string;
  price: number;
  store: string;
  url: string;
  currency: string;
  date: string;
  inStock: boolean;
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
  priceHistory: SerializedPriceEntry[];
  links: { label: string; url: string; price?: number | null }[];
  receiptIds: string[];
  photos: string[];
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
  currency: string;
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
  amount: number;
  currency: string;
  date: string;
  period: string;
  recurring: boolean;
  recurringCycle: 'monthly' | 'quarterly' | 'yearly' | 'weekly' | '';
  filePath: string;
  fileType: string;
  thumbPath: string;
  fileSize: number;
  paymentMethod: string;
  notes: string;
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

// P28 — a manually-paid bill/payable whose status (paid/overdue/due-soon) is derived.
export type SerializedBill = {
  _id: string;
  title: string;
  vendor: string;
  amount: number;
  dueDate: string | null;
  paidAt: string | null;
  category: string;
  cycle: '' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';
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
  currency: string;
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
