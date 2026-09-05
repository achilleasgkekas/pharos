import { connectDB } from '@/lib/db';
import { Expense as ExpenseModel } from '@/models/Expense';
import { Statement as StatementModel } from '@/models/Statement';
import { Subscription as SubscriptionModel } from '@/models/Subscription';
import { Goal as GoalModel } from '@/models/Goal';
import { withRequestTenant } from '@/lib/tenancy/request';
import { currentModel } from '@/lib/tenancy/connection';
import { getAppSettings } from '@/lib/appSettings';
import { computeInstallmentPlans } from '@/lib/installments';
import { monthlyEquivalent } from '@/lib/billingCycle';
import { goalCurrent } from '@/lib/goals';
import { monthlyBaseline, projectBalances, monthTotalsFrom, type LedgerEntry, type Lever, type Obligation } from '@/lib/savingsPlan';
import type { SerializedStatement } from '@/types';
import type { SavingsData, SavingsGoal } from './types';
import { SavingsClient } from './SavingsClient';

export const dynamic = 'force-dynamic';

// Five years. Long enough that "when could I afford it?" has an answer for a target
// well out of reach this year, short enough that the serialized projection stays small.
const HORIZON_MONTHS = 60;

async function getData(): Promise<SavingsData> {
  return withRequestTenant(async () => {
    await connectDB();
    const Expense = await currentModel(ExpenseModel);
    const Statement = await currentModel(StatementModel);
    const Subscription = await currentModel(SubscriptionModel);
    const Goal = await currentModel(GoalModel);

    const [expensesRaw, statementsRaw, subsRaw, goalsRaw, settings] = await Promise.all([
      Expense.find({ amount: { $gt: 0 } }).select('kind amount date period').lean(),
      Statement.find().lean(),
      Subscription.find({ active: true }).select('name provider amount billingCycle').lean(),
      Goal.find({ archived: { $ne: true } }).sort({ targetDate: 1, createdAt: -1 }).lean(),
      getAppSettings(),
    ]);

    // ── What a month of the ledger actually looks like ──────────────────────
    // The bucketing rule (period when present, else date) lives in the engine so this
    // page and /reports cannot drift apart on which month a row belongs to.
    const history = monthTotalsFrom(expensesRaw as LedgerEntry[]);

    // ── The one thing history overstates about the future ───────────────────
    // A card instalment is in every month behind you and in none of the months after
    // its last payment, so it is the only part of the baseline that is allowed to bend.
    const plans = computeInstallmentPlans(JSON.parse(JSON.stringify(statementsRaw)) as SerializedStatement[]);
    const obligations: Obligation[] = plans
      .filter((p) => !p.done && p.remainingInstallments > 0 && p.perAmount > 0)
      .map((p) => ({ label: p.label, perMonth: Math.round(p.perAmount * 100) / 100, monthsRemaining: p.remainingInstallments }));

    // ── What could be cut if a target does not fit ──────────────────────────
    const levers: Lever[] = (subsRaw as { name?: string; provider?: string; amount?: number; billingCycle?: string }[])
      .map((s) => ({
        label: s.name || s.provider || 'Subscription',
        perMonth: Math.round(monthlyEquivalent(s.amount || 0, s.billingCycle || 'monthly') * 100) / 100,
      }))
      .filter((l) => l.perMonth > 0)
      .sort((a, b) => b.perMonth - a.perMonth);

    // The only "money you actually have" figure in the app: the manual asset accounts
    // that net worth is built from (Settings → Net worth). Absent → the forecast starts
    // at zero and the UI says so rather than pretending the balance is real.
    const accounts = Object.values(settings.assetAccounts || {});
    const startBalance = Math.round(accounts.reduce((s, v) => s + (Number(v) || 0), 0) * 100) / 100;

    const baseline = monthlyBaseline(history);
    const projection = projectBalances({ startBalance, baseline, obligations, months: HORIZON_MONTHS });

    const goals: SavingsGoal[] = (goalsRaw as unknown as {
      _id: unknown; title?: string; targetAmount?: number; targetDate?: Date | null; contributions?: { amount: number }[];
    }[]).map((g) => ({
      _id: String(g._id),
      title: g.title || 'Goal',
      target: g.targetAmount || 0,
      saved: goalCurrent({ targetAmount: g.targetAmount || 0, contributions: g.contributions || [] }),
      targetDate: g.targetDate ? new Date(g.targetDate).toISOString() : null,
    }));

    return {
      baseline,
      projection,
      startBalance,
      hasAccounts: accounts.length > 0,
      obligations,
      levers,
      goals,
      history: history.slice(-13), // a year of context for the "what you actually do" chart
    };
  });
}

export default async function SavingsPage() {
  return <SavingsClient data={await getData()} />;
}
