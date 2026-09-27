'use server';
// P9 slice 9 — fill in a missing exchange rate from the /reports audit panel, instead of
// being sent to one of six different edit forms to do it. The conversion rule itself lives
// in lib/fxApply.ts (pure, unit-tested); this file only reads the documents, applies the
// patch it returns, and refreshes the affected routes.
import { connectDB } from '@/lib/db';
import { withRequestTenant } from '@/lib/tenancy/request';
import { currentModel } from '@/lib/tenancy/connection';
import { Expense } from '@/models/Expense';
import { Receipt } from '@/models/Receipt';
import { Item } from '@/models/Item';
import { Subscription } from '@/models/Subscription';
import { Statement } from '@/models/Statement';
import { Bill } from '@/models/Bill';
import { getAppSettings } from '@/lib/appSettings';
import { fxNeedsRateFilter, type FxIssueKind } from '@/lib/fxAudit';
import { fxApplyPatch, isValidFxRate, FX_APPLY_SELECT } from '@/lib/fxApply';
import { normalizeCurrency } from '@/lib/fx';
import { revalidatePath } from 'next/cache';
import type { Model } from 'mongoose';
import { assertCanWrite } from '@/lib/auth';
import { settleBillsCoveredByPayments } from '@/app/bills/actions';

export type FxApplyResult = { ok: true; applied: number } | { ok: false; error: string };

/** One bulk call must stay bounded; a whole bank import of foreign rows fits comfortably. */
const MAX_BULK = 500;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyModel = Model<any>;

/** Income and expenses are one collection split by `kind`, hence two keys, one model. */
function modelFor(kind: FxIssueKind): AnyModel {
  const map: Record<FxIssueKind, AnyModel> = {
    expense: Expense as AnyModel,
    income: Expense as AnyModel,
    bill: Bill as AnyModel,
    subscription: Subscription as AnyModel,
    receipt: Receipt as AnyModel,
    item: Item as AnyModel,
    statement: Statement as AnyModel,
  };
  return map[kind];
}

const KINDS: FxIssueKind[] = ['expense', 'income', 'receipt', 'item', 'subscription', 'statement', 'bill'];

function isKind(v: unknown): v is FxIssueKind {
  return typeof v === 'string' && (KINDS as string[]).includes(v);
}

/**
 * The routes whose figures change once a record stops being denominated in a foreign
 * currency. Deliberately broad: the converted amount feeds the dashboard totals and the
 * calendar as well as its own module's list.
 */
function revalidateMoneyRoutes() {
  for (const p of ['/reports', '/', '/expenses', '/income', '/receipts', '/items', '/shopping', '/subscriptions', '/statements', '/bills', '/calendar']) {
    revalidatePath(p);
  }
}

/** Set the rate on ONE record found by the audit, converting all of its money fields. */
export async function applyFxRate(kind: string, id: string, rate: number): Promise<FxApplyResult> {
  await assertCanWrite();
  if (!isKind(kind)) return { ok: false, error: 'Unknown record type' };
  if (!/^[a-f0-9]{24}$/i.test(String(id || ''))) return { ok: false, error: 'Invalid id' };
  if (!isValidFxRate(rate)) return { ok: false, error: 'Enter a positive exchange rate' };

  return withRequestTenant(async () => {
    try {
      await connectDB();
      const settings = await getAppSettings();
      const M = await currentModel(modelFor(kind));
      const doc = await M.findById(id).select(FX_APPLY_SELECT[kind]).lean();
      if (!doc) return { ok: false, error: 'Record not found' };

      const patch = fxApplyPatch(kind, doc as Record<string, unknown>, rate, settings.currency);
      // null = already converted, or not foreign. Not an error: the panel may simply be
      // showing a list another tab has already fixed. Report zero, never double-convert.
      if (!patch) return { ok: true, applied: 0 };

      await M.updateOne({ _id: id }, { $set: patch });
      // #297: instalments logged while the rate was missing could not settle the bill; now they can.
      if (kind === 'bill') await settleBillsCoveredByPayments([id]);
      revalidateMoneyRoutes();
      return { ok: true, applied: 1 };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  });
}

/**
 * Set the same rate on EVERY record still printed in `currency`. This is the common case:
 * a bank CSV import creates dozens of foreign rows at once and one rate covers them all,
 * which is precisely when fixing them one form at a time is unbearable.
 */
export async function applyFxRateToCurrency(currency: string, rate: number): Promise<FxApplyResult> {
  await assertCanWrite();
  const code = normalizeCurrency(currency);
  if (!code) return { ok: false, error: 'Invalid currency code' };
  if (!isValidFxRate(rate)) return { ok: false, error: 'Enter a positive exchange rate' };

  return withRequestTenant(async () => {
    try {
      await connectDB();
      const settings = await getAppSettings();
      const base = settings.currency;
      if (code === (normalizeCurrency(base) || 'EUR')) return { ok: false, error: 'That is the base currency' };

      // Keep the audit's own predicate as the source of truth for "still needs a rate",
      // narrowed to this one printed code.
      const filter = { ...fxNeedsRateFilter(base), currency: code };
      let applied = 0;
      const billIds: string[] = [];

      for (const kind of ['expense', 'receipt', 'item', 'subscription', 'statement', 'bill'] as FxIssueKind[]) {
        const M = await currentModel(modelFor(kind));
        // Archived receipts and bills are out of the way; the audit skips them too.
        const scoped = kind === 'receipt' || kind === 'bill' ? { ...filter, archived: { $ne: true } } : filter;
        const docs = await M.find(scoped).select(FX_APPLY_SELECT[kind]).limit(MAX_BULK).lean();

        const ops = [];
        for (const d of docs as Record<string, unknown>[]) {
          // Expenses carry both kinds in one collection; the patch is identical, but the
          // kind is resolved honestly rather than assumed.
          const k: FxIssueKind = kind === 'expense' && d.kind === 'income' ? 'income' : kind;
          const patch = fxApplyPatch(k, d, rate, base);
          if (patch) ops.push({ updateOne: { filter: { _id: d._id }, update: { $set: patch } } });
        }
        if (ops.length) {
          await M.bulkWrite(ops);
          applied += ops.length;
          if (kind === 'bill') billIds.push(...ops.map((o) => String(o.updateOne.filter._id)));
        }
      }
      // #297: see applyFxRate.
      await settleBillsCoveredByPayments(billIds);

      if (applied > 0) revalidateMoneyRoutes();
      return { ok: true, applied };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  });
}
