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

export function currentBase() { return base; }

/** Load a saved session on app start. Returns true if a token is present. */
export async function loadSession(): Promise<boolean> {
  const [b, t] = await Promise.all([
    SecureStore.getItemAsync(STORE_KEYS.base),
    SecureStore.getItemAsync(STORE_KEYS.token),
  ]);
  if (b) base = b;
  token = t;
  return !!token;
}

async function persist() {
  await SecureStore.setItemAsync(STORE_KEYS.base, base);
  if (token) await SecureStore.setItemAsync(STORE_KEYS.token, token);
}

export async function logout() {
  token = null;
  await SecureStore.deleteItemAsync(STORE_KEYS.token);
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
