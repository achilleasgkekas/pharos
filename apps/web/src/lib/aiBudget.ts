// Self-hosted AI spend cap. A monthly ceiling (in the app's display currency) on what cloud
// AI calls may cost; when this month's estimated spend reaches it, further CLOUD calls are
// blocked with AiBudgetExceededError until the user raises the cap or the month rolls over.
//
// This is the OSS/self-hosted counterpart to the SaaS per-tenant quota (billing/aiMeter.ts):
// that path caps by plan CALL VOLUME and no-ops for the default tenant, so it can't answer
// "spend at most €X/month". This one runs ONLY when SAAS_MODE is off, reads/writes the single
// AppConfig singleton, and prices each call from the model id (lib/aiPricing.ts). Local Ollama
// calls are free, so the gate is only applied to cloud providers by the caller.
import { connectDB } from './db';
import { AppConfig } from '@/models/AppConfig';
import { saasMode } from './tenancy/saasMode';
import { callCostMicros } from './aiPricing';

const MICROS = 1_000_000; // micros per one currency unit (matches billing/aiCost.ts)

/** Thrown before a cloud AI call when this month's spend has reached the configured cap. */
export class AiBudgetExceededError extends Error {
  readonly code = 'ai_budget_exceeded' as const;
  readonly budget: number; // monthly cap, currency units
  readonly spent: number; // this month's spend so far, currency units
  constructor(budget: number, spent: number) {
    super(`Monthly AI budget reached: ${spent.toFixed(2)} of ${budget.toFixed(2)}`);
    this.name = 'AiBudgetExceededError';
    this.budget = budget;
    this.spent = spent;
  }
}

/** Calendar-month key "YYYY-MM" in UTC — the ledger resets when this changes. */
export function budgetPeriod(now: Date = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

export type AiBudgetStatus = {
  budget: number; // monthly cap in currency units; 0 = no cap
  spent: number; // this month's estimated spend in currency units
  period: string; // YYYY-MM
  capped: boolean; // budget > 0 && spent >= budget
};

/** Read the self-hosted budget status. A stored period other than the current month reads as
 *  spent: 0 (implicit monthly rollover — the counter is only rewritten on the next spend). */
export async function getAiBudgetStatus(): Promise<AiBudgetStatus> {
  const period = budgetPeriod();
  try {
    await connectDB();
    const doc = (await AppConfig.findOne({ key: 'singleton' })
      .select('aiMonthlyBudget aiSpendPeriod aiSpendMicros')
      .lean()) as { aiMonthlyBudget?: number; aiSpendPeriod?: string; aiSpendMicros?: number } | null;
    const budget = Math.max(0, Number(doc?.aiMonthlyBudget) || 0);
    const spentMicros = doc?.aiSpendPeriod === period ? Math.max(0, Number(doc?.aiSpendMicros) || 0) : 0;
    const spent = spentMicros / MICROS;
    return { budget, spent, period, capped: budget > 0 && spent >= budget };
  } catch {
    return { budget: 0, spent: 0, period, capped: false };
  }
}

/** Gate a CLOUD AI call on the self-hosted monthly cap. No-op in SaaS mode (per-tenant quota
 *  handles it there). Throws AiBudgetExceededError when this month is already at/over the cap. */
export async function assertAiBudget(): Promise<void> {
  if (saasMode()) return;
  const s = await getAiBudgetStatus();
  if (s.capped) throw new AiBudgetExceededError(s.budget, s.spent);
}

/** Add one cloud call's estimated cost to this month's ledger. No-op in SaaS; never throws —
 *  a ledger write must not break the AI response the user already received. */
export async function recordAiSpend(model: string, inputTokens: number, outputTokens: number): Promise<void> {
  if (saasMode()) return;
  const micros = callCostMicros(model, inputTokens, outputTokens);
  if (micros <= 0) return;
  const period = budgetPeriod();
  try {
    await connectDB();
    // Same month → increment atomically. No match means the stored period is stale (or unset),
    // so start a fresh month seeded with this call's cost.
    const res = await AppConfig.updateOne(
      { key: 'singleton', aiSpendPeriod: period },
      { $inc: { aiSpendMicros: micros } },
    );
    if (res.matchedCount === 0) {
      await AppConfig.updateOne(
        { key: 'singleton' },
        { $set: { aiSpendPeriod: period, aiSpendMicros: micros } },
        { upsert: true },
      );
    }
  } catch {
    /* best-effort */
  }
}
