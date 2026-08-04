import { NextRequest, NextResponse } from 'next/server';
import { withAuth, apiError } from '@/lib/apiAuth';
import { canAdmin } from '@/lib/roles';
import { readBody } from '@/lib/apiBody';
import { connectDB } from '@/lib/db';
import { Expense as ExpenseModel } from '@/models/Expense';
import { AppConfig as AppConfigModel } from '@/models/AppConfig';
import { currentModel } from '@/lib/tenancy/connection';
import { getAppSettings, invalidateAppSettings } from '@/lib/appSettings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** This-month expense total per category (by period when set, else by date). */
async function spentThisMonth(period: string, monthStart: Date, monthEnd: Date): Promise<Record<string, number>> {
  // Called from inside withAuth, so the ambient workspace is already established.
  const Expense = await currentModel(ExpenseModel);
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
  return withAuth(req, async (user) => {
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
      // one); API clients use it to decide whether to show FX controls at all.
      multiCurrency: s.multiCurrency,
      defaultVatRate: s.defaultVatRate,
      defaultItemView: s.defaultItemView,
      defaultWarrantyMonths: s.defaultWarrantyMonths,
      warrantyAlertDays: s.warrantyAlertDays,
      trialAlertDays: s.trialAlertDays,
      autoAddStores: s.autoAddStores,
      ntfyUrl: s.ntfyUrl,
      ntfyEnabled: s.ntfyEnabled,
      // Readable by everyone (a member should be able to see WHERE alerts go), writable by
      // admins only — see PATCH. Sent so the client renders the section read-only instead of
      // letting someone type a URL that will be silently dropped on save.
      canEditNtfy: canAdmin(user.role),
      budgetRollover: s.budgetRollover,
      expenseCategories: s.expenseCategories,
      period,
      budgets,
    });
  });
}

/** PATCH /api/v1/settings → update preferences/defaults, ntfy, and/or budgets.
 *  Mirrors the web saveDefaults / saveBudgets (open to any writer) and saveNtfy (admin-only)
 *  actions.
 *
 *  ntfy is the one admin-gated pair here, matching `saveNtfy`: the topic URL is an OUTPUT
 *  channel, so whoever can change it re-routes every alert of the whole instance to a topic
 *  of their choosing. Enforcing that on the web while leaving the API open would make the
 *  web guard decorative.
 *
 *  A non-admin's ntfy fields are dropped SILENTLY rather than failing the request, because
 *  an API client's Settings screen saves everything in one PATCH: a 403 there would read as "none
 *  of my settings saved" when in fact currency/VAT/budgets are perfectly allowed. The one
 *  exception is a request that carries nothing BUT ntfy fields — there is no other work to
 *  protect, so answering `ok: true` would be a lie and it gets an honest 403 instead. */
export async function PATCH(req: NextRequest) {
  return withAuth(req, async (user) => {
    const b = await readBody(req);
    const set: Record<string, unknown> = {};
    const mayEditNtfy = canAdmin(user.role);
    let droppedNtfy = false;

    if (typeof b.currency === 'string' && b.currency.trim()) set.currency = b.currency.trim().toUpperCase().slice(0, 4);
    if (b.defaultVatRate != null && Number.isFinite(Number(b.defaultVatRate))) set.defaultVatRate = clamp(Number(b.defaultVatRate), 0, 100);
    if (b.defaultItemView != null) set.defaultItemView = b.defaultItemView === 'list' ? 'list' : 'grid';
    if (b.defaultWarrantyMonths != null && Number.isFinite(Number(b.defaultWarrantyMonths))) set.defaultWarrantyMonths = clamp(Number(b.defaultWarrantyMonths), 0, 120);
    if (b.warrantyAlertDays != null && Number.isFinite(Number(b.warrantyAlertDays))) set.warrantyAlertDays = clamp(Number(b.warrantyAlertDays), 0, 730);
    if (b.trialAlertDays != null && Number.isFinite(Number(b.trialAlertDays))) set.trialAlertDays = clamp(Number(b.trialAlertDays), 0, 60);
    if (typeof b.autoAddStores === 'boolean') set.autoAddStores = b.autoAddStores;
    if (typeof b.ntfyUrl === 'string' || typeof b.ntfyEnabled === 'boolean') {
      if (mayEditNtfy) {
        if (typeof b.ntfyUrl === 'string') set.ntfyUrl = b.ntfyUrl.trim();
        if (typeof b.ntfyEnabled === 'boolean') set.ntfyEnabled = b.ntfyEnabled;
      } else {
        droppedNtfy = true;
      }
    }
    if (typeof b.budgetRollover === 'boolean') set.budgetRollover = b.budgetRollover;

    if (b.budgets && typeof b.budgets === 'object') {
      const clean: Record<string, number> = {};
      for (const [k, v] of Object.entries(b.budgets as Record<string, unknown>)) {
        const n = Number(v);
        if (k && Number.isFinite(n) && n > 0) clean[k.trim()] = Math.round(n * 100) / 100;
      }
      set.budgets = clean;
    }

    if (!Object.keys(set).length) {
      // Nothing survived. Say WHY when the reason was the role, not a malformed body.
      return droppedNtfy
        ? apiError('Admin only — notification settings are managed by an admin', 403)
        : apiError('no valid fields');
    }
    await connectDB();
    const AppConfig = await currentModel(AppConfigModel);
    await AppConfig.updateOne({ key: 'singleton' }, { $set: set }, { upsert: true });
    invalidateAppSettings();
    return NextResponse.json({ ok: true });
  });
}
