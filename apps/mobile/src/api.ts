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
