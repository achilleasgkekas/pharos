import * as SecureStore from 'expo-secure-store';
import { DEFAULT_API_BASE, STORE_KEYS } from './config';

// ---- Types (mirror the Pharos /api/v1 responses) ----
export type SessionUser = { id: string; name: string; username: string; role: 'admin' | 'member' };
export type ListItem = {
  _id: string; name: string; quantity: string; category: string; brand: string;
  note: string; checked: boolean; aiScanned: boolean; createdAt: string;
};
export type Overview = {
  counts: { items: number; shoppingList: number; receipts: number; expenses: number; subscriptions: number; openTasks: number };
  installmentsOwed: number; activeInstallmentPlans: number; currency: string;
};
export type ScannedProduct = { name: string; brand: string; category: string; quantity: string; notes: string };

// ---- Session (base URL + bearer token), persisted in SecureStore ----
let base = DEFAULT_API_BASE;
let token: string | null = null;
let user: SessionUser | null = null;

export function currentBase() { return base; }
export function currentUser() { return user; }

/** Load a saved session on app start. Returns true if a token is present. */
export async function loadSession(): Promise<boolean> {
  const [b, t, u] = await Promise.all([
    SecureStore.getItemAsync(STORE_KEYS.base),
    SecureStore.getItemAsync(STORE_KEYS.token),
    SecureStore.getItemAsync(STORE_KEYS.user),
  ]);
  if (b) base = b;
  token = t;
  if (u) { try { user = JSON.parse(u) as SessionUser; } catch { /* ignore */ } }
  return !!token;
}

async function persist() {
  await SecureStore.setItemAsync(STORE_KEYS.base, base);
  if (token) await SecureStore.setItemAsync(STORE_KEYS.token, token);
  if (user) await SecureStore.setItemAsync(STORE_KEYS.user, JSON.stringify(user));
}

export async function logout() {
  token = null;
  user = null;
  await SecureStore.deleteItemAsync(STORE_KEYS.token);
  await SecureStore.deleteItemAsync(STORE_KEYS.user);
}

function normBase(url: string) {
  return url.trim().replace(/\/+$/, '');
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { ...(init.headers as Record<string, string>) };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (init.body && typeof init.body === 'string') headers['Content-Type'] = 'application/json';
  const res = await fetch(base + path, { ...init, headers });
  const text = await res.text();
  let json: unknown = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON */ }
  if (!res.ok) {
    const msg = (json as { error?: string } | null)?.error || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return json as T;
}

// ---- Auth ----
export async function login(serverUrl: string, username: string, password: string): Promise<SessionUser> {
  base = normBase(serverUrl);
  const r = await request<{ token: string; user: SessionUser }>('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  token = r.token;
  user = r.user;
  await persist();
  return r.user;
}

// ---- Reads ----
export function getOverview() { return request<Overview>('/api/v1/overview'); }

export async function getShoppingList(): Promise<ListItem[]> {
  const r = await request<{ items: ListItem[] }>('/api/v1/shopping-list');
  return r.items ?? [];
}

// ---- Shopping-list writes ----
export function addListItem(data: { name: string; quantity?: string; category?: string; brand?: string }) {
  return request<{ ok: boolean; items: ListItem[] }>('/api/v1/shopping-list', { method: 'POST', body: JSON.stringify(data) });
}
export function toggleListItem(id: string, checked: boolean) {
  return request<{ ok: boolean }>(`/api/v1/shopping-list/${id}`, { method: 'PATCH', body: JSON.stringify({ checked }) });
}
export function deleteListItem(id: string) {
  return request<{ ok: boolean }>(`/api/v1/shopping-list/${id}`, { method: 'DELETE' });
}

// ---- AI product scan (multipart) ----
export async function scanProduct(uri: string): Promise<ScannedProduct> {
  const fd = new FormData();
  // React Native multipart file shape
  fd.append('file', { uri, name: 'photo.jpg', type: 'image/jpeg' } as unknown as Blob);
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(base + '/api/v1/scan/product', { method: 'POST', headers, body: fd });
  const json = (await res.json().catch(() => null)) as { data?: ScannedProduct; error?: string } | null;
  if (!res.ok || !json?.data) throw new Error(json?.error || `Scan failed (HTTP ${res.status})`);
  return json.data;
}

// ===================== Additional resources =====================
export type Task = { id: string; title: string; status: string; priority: string; tags: string[]; dueDate: string | null; completedAt: string | null; updatedAt: string | null };
export type Expense = { id: string; kind: string; vendor: string; category: string; amount: number; currency: string; date: string | null; period: string; recurring: boolean; file: string | null; thumb: string | null; verified: boolean };
export type Subscription = { id: string; name: string; provider: string; category: string; amount: number; currency: string; billingCycle: string; nextRenewal: string | null; active: boolean };
export type ReceiptSummary = { id: string; store: string; date: string | null; total: number; currency: string; itemCount: number; verified: boolean; archived: boolean; file: string | null; thumb: string | null };
export type ReceiptLine = { name: string; qty: number; price: number; vatRate: number };
export type ReceiptDetail = ReceiptSummary & { subtotal: number; vatAmount: number; paymentMethod: string; warrantyMonths: number; notes: string; lineItems: ReceiptLine[] };
export type Item = { id: string; num: string; title: string; status: string; category: string; currentPrice: number; purchasedPrice: number | null; targetPrice: number | null; specs: string; warrantyUntil: string | null; tags: string[]; photo: string | null };

// ---- Tasks ----
export async function getTasks(status?: string): Promise<Task[]> {
  const q = status ? `?status=${status}&limit=200` : '?limit=200';
  return (await request<{ data: Task[] }>(`/api/v1/tasks${q}`)).data ?? [];
}
export function addTask(title: string) { return request<{ task: Task }>('/api/v1/tasks', { method: 'POST', body: JSON.stringify({ title }) }); }
export function setTaskStatus(id: string, status: string) { return request<{ task: Task }>(`/api/v1/tasks/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }); }
export function updateTask(id: string, data: { title?: string; status?: string; priority?: string }) { return request<{ task: Task }>(`/api/v1/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(data) }); }
export function deleteTask(id: string) { return request<{ ok: boolean }>(`/api/v1/tasks/${id}`, { method: 'DELETE' }); }

// ---- Expenses / income ----
export async function getExpenses(kind: 'expense' | 'income'): Promise<Expense[]> {
  return (await request<{ data: Expense[] }>(`/api/v1/expenses?kind=${kind}&limit=200`)).data ?? [];
}
export function addExpense(data: { vendor: string; amount: number; kind: 'expense' | 'income'; category?: string }) {
  return request<{ expense: Expense }>('/api/v1/expenses', { method: 'POST', body: JSON.stringify(data) });
}

// ---- Subscriptions ----
export async function getSubscriptions(): Promise<Subscription[]> {
  return (await request<{ data: Subscription[] }>('/api/v1/subscriptions?limit=200')).data ?? [];
}
export function addSubscription(data: { name: string; amount: number; billingCycle?: string }) {
  return request<{ subscription: Subscription }>('/api/v1/subscriptions', { method: 'POST', body: JSON.stringify(data) });
}

// ---- Receipts ----
export async function getReceipts(): Promise<ReceiptSummary[]> {
  return (await request<{ data: ReceiptSummary[] }>('/api/v1/receipts?limit=100')).data ?? [];
}
export async function getReceipt(id: string): Promise<ReceiptDetail> {
  return (await request<{ receipt: ReceiptDetail }>(`/api/v1/receipts/${id}`)).receipt;
}
export async function scanReceipt(uri: string): Promise<ReceiptDetail & { aiUsed: boolean; aiError: string | null }> {
  const fd = new FormData();
  fd.append('file', { uri, name: 'receipt.jpg', type: 'image/jpeg' } as unknown as Blob);
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(base + '/api/v1/scan/receipt', { method: 'POST', headers, body: fd });
  const json = (await res.json().catch(() => null)) as { receipt?: ReceiptDetail & { aiUsed: boolean; aiError: string | null }; error?: string } | null;
  if (!res.ok || !json?.receipt) throw new Error(json?.error || `Scan failed (HTTP ${res.status})`);
  return json.receipt;
}

// ---- Items / inventory ----
export async function getItems(status: 'shopping' | 'inventory' | 'all' = 'all'): Promise<Item[]> {
  return (await request<{ items: Item[] }>(`/api/v1/items?status=${status}&limit=300`)).items ?? [];
}
export function createItem(data: { title: string; status?: string; category?: string; currentPrice?: number }) {
  return request<{ item: Item }>('/api/v1/items', { method: 'POST', body: JSON.stringify(data) });
}

// ---- Files (bearer-protected). RN <Image> can attach the auth header via source.headers. ----
export function fileSource(path: string | null): { uri: string; headers?: Record<string, string> } | undefined {
  if (!path) return undefined;
  const uri = `${base}/api/files/${path.split('/').map(encodeURIComponent).join('/')}`;
  return token ? { uri, headers: { Authorization: `Bearer ${token}` } } : { uri };
}

// ---- AI command bar ----
export type AiTurn = { role: 'user' | 'assistant'; content: string };
export function aiCommand(messages: AiTurn[]) {
  return request<{ reply: string; actions: { name: string; summary: string }[] }>('/api/v1/ai', { method: 'POST', body: JSON.stringify({ messages }) });
}

// ---- Vouchers ----
export type Voucher = { id: string; title: string; code: string; store: string; discount: string; expiresAt: string | null; used: boolean; url: string; notes: string };
export async function getVouchers(): Promise<Voucher[]> {
  return (await request<{ data: Voucher[] }>('/api/v1/vouchers?limit=200')).data ?? [];
}
export function addVoucher(data: { title: string; code?: string; store?: string }) {
  return request<{ voucher: Voucher }>('/api/v1/vouchers', { method: 'POST', body: JSON.stringify(data) });
}

// ---- Statements ----
export type Statement = { id: string; card: string; last4: string; period: string; statementDate: string | null; dueDate: string | null; totalAmount: number; minimumPayment: number; paidAmount: number; currency: string; txnCount: number };
export async function getStatements(): Promise<Statement[]> {
  return (await request<{ data: Statement[] }>('/api/v1/statements?limit=100')).data ?? [];
}
export type StatementTxn = { id: string; date: string | null; description: string; amount: number; category: string; installment: { current: number; total: number } | null };
export async function getStatementTxns(id: string): Promise<StatementTxn[]> {
  return (await request<{ transactions: StatementTxn[] }>(`/api/v1/statements/${id}`)).transactions ?? [];
}

// ---- App settings (preferences + this-month budgets) ----
export type BudgetRow = { category: string; limit: number; spent: number };
export type AppSettings = {
  currency: string;
  defaultVatRate: number;
  defaultItemView: 'grid' | 'list';
  defaultWarrantyMonths: number;
  warrantyAlertDays: number;
  autoAddStores: boolean;
  ntfyUrl: string;
  ntfyEnabled: boolean;
  expenseCategories: string[];
  period: string;
  budgets: BudgetRow[];
};
export async function getSettings(): Promise<AppSettings> {
  return request<AppSettings>('/api/v1/settings');
}
export type SettingsPatch = Partial<{
  currency: string;
  defaultVatRate: number;
  defaultItemView: 'grid' | 'list';
  defaultWarrantyMonths: number;
  warrantyAlertDays: number;
  autoAddStores: boolean;
  ntfyUrl: string;
  ntfyEnabled: boolean;
  budgets: Record<string, number>;
}>;
export function updateSettings(patch: SettingsPatch) {
  return request<{ ok: boolean }>('/api/v1/settings', { method: 'PATCH', body: JSON.stringify(patch) });
}
export function testNotify() {
  return request<{ ok: boolean }>('/api/v1/settings/test-notify', { method: 'POST' });
}

// ---- Payment cards (Settings → cards CRUD) ----
export type Card = {
  id: string; name: string; last4: string; bank: string;
  kind: 'credit' | 'debit'; type: 'mastercard' | 'visa' | 'amex' | 'maestro' | 'other';
  color: string; creditLimit: number; notes: string; active: boolean;
};
export type CardInput = Partial<Omit<Card, 'id'>> & { name?: string };
export async function getCards(): Promise<Card[]> {
  return (await request<{ cards: Card[] }>('/api/v1/cards')).cards ?? [];
}
export function createCard(data: CardInput) {
  return request<{ card: Card }>('/api/v1/cards', { method: 'POST', body: JSON.stringify(data) });
}
export function updateCard(id: string, data: CardInput) {
  return request<{ ok: boolean }>(`/api/v1/cards/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}
export function deleteCard(id: string) {
  return request<{ ok: boolean }>(`/api/v1/cards/${id}`, { method: 'DELETE' });
}

// ---- Reports ----
export type Reports = {
  currency: string;
  thisMonth: { income: number; expense: number; net: number };
  thisYear: { income: number; expense: number; net: number };
  byCategory: { category: string; total: number }[];
  monthly: { period: string; expense: number; income: number }[];
};
export function getReports() { return request<Reports>('/api/v1/reports'); }

// ---- Calendar ----
export type CalEvent = { date: string; kind: 'renewal' | 'voucher' | 'warranty'; label: string; amount?: number };
export async function getCalendar(): Promise<{ currency: string; events: CalEvent[] }> {
  return request<{ currency: string; days: number; events: CalEvent[] }>('/api/v1/calendar');
}

// ---- Global search ----
export type SearchHit = { type: string; id: string; title: string; subtitle: string };
export async function search(q: string): Promise<SearchHit[]> {
  if (q.trim().length < 2) return [];
  return (await request<{ hits: SearchHit[] }>(`/api/v1/search?q=${encodeURIComponent(q.trim())}`)).hits ?? [];
}

// ---- Deletes (soft → Trash) ----
const del = (path: string) => request<{ ok: boolean }>(path, { method: 'DELETE' });
export const deleteItemRecord = (id: string) => del(`/api/v1/items/${id}`);
export const deleteExpense = (id: string) => del(`/api/v1/expenses/${id}`);
export const deleteSubscription = (id: string) => del(`/api/v1/subscriptions/${id}`);
export const deleteVoucher = (id: string) => del(`/api/v1/vouchers/${id}`);

// ---- Trash (soft-deleted records: restore / purge) ----
export type TrashType = 'item' | 'receipt' | 'expense' | 'subscription' | 'voucher' | 'task';
export type TrashRow = { type: TrashType; id: string; title: string; subtitle: string; deletedAt: string };
export async function getTrash(): Promise<TrashRow[]> {
  return (await request<{ rows: TrashRow[] }>('/api/v1/trash')).rows ?? [];
}
export function restoreTrash(type: TrashType, id: string) {
  return request<{ ok: boolean }>(`/api/v1/trash/${type}/${id}`, { method: 'PATCH' });
}
export function purgeTrash(type: TrashType, id: string) {
  return request<{ ok: boolean }>(`/api/v1/trash/${type}/${id}`, { method: 'DELETE' });
}

// ---- Activity: background AI jobs (read-only) ----
export type JobRow = {
  _id: string;
  kind: string;
  title: string;
  status: 'running' | 'done' | 'error';
  total: number;
  done: number;
  ok: number;
  current: string;
  lastLabel: string;
  lastDetail: string;
  error: string;
  createdAt: string;
  finishedAt: string | null;
};
export async function getJobs(): Promise<JobRow[]> {
  return (await request<{ rows: JobRow[] }>('/api/v1/jobs')).rows ?? [];
}

// ---- Activity: saved AI conversations (read-only) ----
export type ConversationMsg = { role: 'user' | 'assistant'; content: string; actions?: { name: string; summary: string }[] };
export type ConversationRow = { id: string; title: string; turns: number; updatedAt: string; preview: string; messages: ConversationMsg[] };
export async function getHistory(): Promise<ConversationRow[]> {
  return (await request<{ rows: ConversationRow[] }>('/api/v1/history')).rows ?? [];
}

export type NotifKind = 'deal' | 'installment' | 'warranty' | 'system';
export type NotificationRow = { _id: string; kind: NotifKind; title: string; body: string; href: string; read: boolean; createdAt: string };
export async function getNotifications(): Promise<{ items: NotificationRow[]; unread: number }> {
  return request<{ items: NotificationRow[]; unread: number }>('/api/v1/notifications');
}
/** Mark one notification read (pass id) or all read (omit). */
export function markNotificationRead(id?: string) {
  return request<{ ok: boolean }>('/api/v1/notifications', { method: 'PATCH', body: JSON.stringify(id ? { id } : {}) });
}

// ---- Push registration (Expo push token ↔ server) ----
export function registerPush(token: string) {
  return request<{ ok: boolean }>('/api/v1/push/register', { method: 'POST', body: JSON.stringify({ token }) });
}
export function unregisterPush(token: string) {
  return request<{ ok: boolean }>('/api/v1/push/register', { method: 'DELETE', body: JSON.stringify({ token }) });
}

// ---- Edits (PATCH) ----
const patch = (path: string, data: object) => request<{ ok: boolean }>(path, { method: 'PATCH', body: JSON.stringify(data) });
export const updateExpense = (id: string, data: { vendor?: string; amount?: number; category?: string; kind?: string; date?: string }) => patch(`/api/v1/expenses/${id}`, data);
export const updateSubscription = (id: string, data: { name?: string; amount?: number; billingCycle?: string; active?: boolean }) => patch(`/api/v1/subscriptions/${id}`, data);
export const updateVoucher = (id: string, data: { title?: string; code?: string; store?: string; used?: boolean }) => patch(`/api/v1/vouchers/${id}`, data);
export const updateReceipt = (id: string, data: { store?: string; total?: number; date?: string; verified?: boolean; archived?: boolean; paymentMethod?: string }) => patch(`/api/v1/receipts/${id}`, data);
export const updateItem = (id: string, data: { title?: string; status?: string; category?: string; currentPrice?: number; targetPrice?: number | null; specs?: string }) => patch(`/api/v1/items/${id}`, data);

// ---- Stores (Settings → store list management) ----
export type StoreRow = { id: string; name: string; url: string; aliases: string[]; auto: boolean };
export type StoreInput = { name?: string; url?: string; aliases?: string[] };
export async function getStores(): Promise<StoreRow[]> {
  return (await request<{ stores: StoreRow[] }>('/api/v1/stores')).stores ?? [];
}
export function createStore(data: StoreInput) {
  return request<{ store: StoreRow }>('/api/v1/stores', { method: 'POST', body: JSON.stringify(data) });
}
export function updateStore(id: string, data: StoreInput) {
  return request<{ ok: boolean }>(`/api/v1/stores/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}
export function deleteStore(id: string) {
  return request<{ ok: boolean }>(`/api/v1/stores/${id}`, { method: 'DELETE' });
}

// ---- Dropdown lists / category taxonomies (Settings → lists editor) ----
export type ListEntry = { key: string; label: string; where: string; values: string[]; default: string[] };
export async function getLists(): Promise<ListEntry[]> {
  return (await request<{ lists: ListEntry[] }>('/api/v1/lists')).lists ?? [];
}
export function saveList(key: string, values: string[]) {
  return request<{ ok: boolean }>('/api/v1/lists', { method: 'PATCH', body: JSON.stringify({ key, values }) });
}

// ---- AI fill ----
export type ParsedSub = { provider?: string; amount?: number; billingCycle?: string; category?: string; currency?: string; notes?: string; url?: string };
export async function suggestSub(name: string): Promise<ParsedSub> {
  return (await request<{ data: ParsedSub }>('/api/v1/ai/subscription', { method: 'POST', body: JSON.stringify({ name }) })).data;
}
export type ParsedVoucherData = { title?: string; code?: string; store?: string; discount?: string; expiresAt?: string | null; url?: string; notes?: string };
export async function scanVoucherText(text: string): Promise<ParsedVoucherData> {
  return (await request<{ data: ParsedVoucherData }>('/api/v1/scan/voucher', { method: 'POST', body: JSON.stringify({ text }) })).data;
}
export type ImportedItem = { id: string; title: string; price: number; store: string; updated: boolean };
export async function importItemUrl(url: string, view: 'shopping' | 'inventory' = 'shopping'): Promise<ImportedItem> {
  const r = await request<{ id: string; title: string; price: number; store: string; updated: boolean }>('/api/v1/items/import', { method: 'POST', body: JSON.stringify({ url, view }) });
  return { id: r.id, title: r.title, price: r.price, store: r.store, updated: r.updated };
}
