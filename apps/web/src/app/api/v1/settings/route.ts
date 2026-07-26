import { NextRequest, NextResponse } from 'next/server';
import { withAuth, apiError } from '@/lib/apiAuth';
import { readBody } from '@/lib/apiBody';
import { connectDB } from '@/lib/db';
import { Expense } from '@/models/Expense';
import { AppConfig } from '@/models/AppConfig';
import { getAppSettings, invalidateAppSettings } from '@/lib/appSettings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** This-month expense total per category (by period when set, else by date). */
async function spentThisMonth(period: string, monthStart: Date, monthEnd: Date): Promise<Record<string, number>> {
  const expenses = (await Expense.find({
    kind: 'expense',
    $or: [{ period }, { period: '', date: { $gte: monthStart, $lt: monthEnd } }],
  })
    .select('category amount')
    .lean()) as { category?: string; amount?: number }[];
  const spent: Record<string, number> = {};
  for (const e of expenses) {
    const c = e.category || 'other';
    spent[c] = (spent[c] || 0) + (e.amount || 0);
  }
  return spent;
}

/** GET /api/v1/settings → app preferences + this-month budget usage. */
export async function GET(req: NextRequest) {
  return withAuth(req, async () => {
    await connectDB();
    const s = await getAppSettings();
    const budgetMap = (s.budgets || {}) as Record<string, number>;

    const now = new Date();
    const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const spent = await spentThisMonth(period, monthStart, monthEnd);

    // One row per category that has a budget, ordered most-over-budget first.
    const budgets = Object.entries(budgetMap)
      .filter(([, limit]) => Number(limit) > 0)
      .map(([category, limit]) => ({
        category,
        limit: Number(limit),
        spent: Math.round((spent[category] || 0) * 100) / 100,
      }))
      .sort((a, b) => b.spent / b.limit - a.spent / a.limit);

    return NextResponse.json({
      currency: s.currency,
      // P9: the deployment-wide "entries may be in another currency" switch. Read-only here
      // on purpose (it is a Settings→Money decision for the whole install, not a per-device
      // one); the mobile client uses it to decide whether to show FX controls at all.
      multiCurrency: s.multiCurrency,
      defaultVatRate: s.defaultVatRate,
      defaultItemView: s.defaultItemView,
      defaultWarrantyMonths: s.defaultWarrantyMonths,
      warrantyAlertDays: s.warrantyAlertDays,
      trialAlertDays: s.trialAlertDays,
      autoAddStores: s.autoAddStores,
      ntfyUrl: s.ntfyUrl,
      ntfyEnabled: s.ntfyEnabled,
      budgetRollover: s.budgetRollover,
      expenseCategories: s.expenseCategories,
      period,
      budgets,
    });
  });
}

/** PATCH /api/v1/settings → update preferences/defaults, ntfy, and/or budgets.
 *  Mirrors the (non-admin-gated) web saveDefaults / saveNtfy / saveBudgets actions. */
export async function PATCH(req: NextRequest) {
  return withAuth(req, async () => {
    const b = await readBody(req);
    const set: Record<string, unknown> = {};

    if (typeof b.currency === 'string' && b.currency.trim()) set.currency = b.currency.trim().toUpperCase().slice(0, 4);
    if (b.defaultVatRate != null && Number.isFinite(Number(b.defaultVatRate))) set.defaultVatRate = clamp(Number(b.defaultVatRate), 0, 100);
    if (b.defaultItemView != null) set.defaultItemView = b.defaultItemView === 'list' ? 'list' : 'grid';
    if (b.defaultWarrantyMonths != null && Number.isFinite(Number(b.defaultWarrantyMonths))) set.defaultWarrantyMonths = clamp(Number(b.defaultWarrantyMonths), 0, 120);
    if (b.warrantyAlertDays != null && Number.isFinite(Number(b.warrantyAlertDays))) set.warrantyAlertDays = clamp(Number(b.warrantyAlertDays), 0, 730);
    if (b.trialAlertDays != null && Number.isFinite(Number(b.trialAlertDays))) set.trialAlertDays = clamp(Number(b.trialAlertDays), 0, 60);
    if (typeof b.autoAddStores === 'boolean') set.autoAddStores = b.autoAddStores;
    if (typeof b.ntfyUrl === 'string') set.ntfyUrl = b.ntfyUrl.trim();
    if (typeof b.ntfyEnabled === 'boolean') set.ntfyEnabled = b.ntfyEnabled;
    if (typeof b.budgetRollover === 'boolean') set.budgetRollover = b.budgetRollover;

    if (b.budgets && typeof b.budgets === 'object') {
      const clean: Record<string, number> = {};
      for (const [k, v] of Object.entries(b.budgets as Record<string, unknown>)) {
        const n = Number(v);
        if (k && Number.isFinite(n) && n > 0) clean[k.trim()] = Math.round(n * 100) / 100;
      }
      set.budgets = clean;
    }

    if (!Object.keys(set).length) return apiError('no valid fields');
    await connectDB();
    await AppConfig.updateOne({ key: 'singleton' }, { $set: set }, { upsert: true });
    invalidateAppSettings();
    return NextResponse.json({ ok: true });
  });
}
