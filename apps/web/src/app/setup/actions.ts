'use server';
import { connectDB } from '@/lib/db';
import { User } from '@/models/User';
import { AppConfig } from '@/models/AppConfig';
import { hashPassword, setSessionCookie, requireAdmin } from '@/lib/auth';
import { invalidateAiConfigCache } from '@/lib/aiConfig';
import { invalidateAppSettings } from '@/lib/appSettings';
import { normalizeShoppingCountry, SHOPPING_PRESETS } from '@/lib/shoppingRegion';
import { saveAiConfig } from '@/app/settings/actions';

/** Step 1 — create the first account (admin) and sign them in. Only works on first run. */
export async function createFirstAdmin(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  await connectDB();
  if ((await User.countDocuments()) > 0) return { ok: false, error: 'Setup already completed.' };

  const username = String(formData.get('username') || '').trim().toLowerCase();
  const name = String(formData.get('name') || '').trim();
  const password = String(formData.get('password') || '');
  const confirm = String(formData.get('confirm') || '');

  if (username.length < 2) return { ok: false, error: 'Username must be at least 2 characters.' };
  if (!/^[a-z0-9._-]+$/.test(username)) return { ok: false, error: 'Username can use letters, numbers, . _ - only.' };
  if (password.length < 8) return { ok: false, error: 'Password must be at least 8 characters.' };
  if (password !== confirm) return { ok: false, error: 'Passwords do not match.' };

  const user = await User.create({ username, name, passwordHash: hashPassword(password), role: 'admin' });
  await setSessionCookie({ sub: String(user._id), role: 'admin', name: name || username });
  return { ok: true };
}

/** Step 2 — currency + default VAT + shopping country (the rest keep their defaults). The
 *  country (#319) is optional so an older client that omits it leaves the setting untouched;
 *  when given, its shipping shops start from the country's preset, editable in Settings. */
export async function saveSetupBasics(currency: string, vat: number, shoppingCountry?: string): Promise<{ ok: boolean }> {
  await requireAdmin();
  await connectDB();
  const code = (currency || 'EUR').trim().toUpperCase() || 'EUR';
  const vatRate = Math.max(0, Math.min(100, Number(vat) || 24));
  const $set: Record<string, unknown> = { currency: code, defaultVatRate: vatRate };
  if (shoppingCountry !== undefined) {
    const country = normalizeShoppingCountry(shoppingCountry);
    $set.shoppingCountry = country;
    $set.shoppingExtraShops = country ? [...SHOPPING_PRESETS[country].extraShops] : [];
  }
  await AppConfig.updateOne({ key: 'singleton' }, { $set }, { upsert: true });
  invalidateAppSettings();
  return { ok: true };
}

/** Step 3a — configure an AI provider (reuses the main settings writer) + enable AI. */
export async function saveSetupAi(formData: FormData): Promise<{ ok: boolean }> {
  await requireAdmin();
  await saveAiConfig(formData);
  await connectDB();
  await AppConfig.updateOne({ key: 'singleton' }, { $set: { aiEnabled: true } }, { upsert: true });
  invalidateAiConfigCache();
  return { ok: true };
}

/** Step 3b — "run without AI": turn the master switch off so the app starts AI-free. */
export async function finishWithoutAi(): Promise<{ ok: boolean }> {
  await requireAdmin();
  await connectDB();
  await AppConfig.updateOne({ key: 'singleton' }, { $set: { aiEnabled: false } }, { upsert: true });
  invalidateAiConfigCache();
  return { ok: true };
}

