/**
 * The numbers an operator actually runs the business on, derived from the fleet tallies the
 * console already loads. PURE — no DB, no env beyond what the billing rules read — so the
 * arithmetic is testable and the console stays a render.
 *
 * The counters that were there (workspaces, accounts, AI calls, storage) answer "how much is
 * happening". These answer "what is it worth and what does it cost", which is the pair you
 * need before onboarding anyone.
 */
import { PLANS, type PlanKey } from '@/lib/billing/plans';
import { aiCharge } from '@/lib/billing/aiBilling';

/**
 * Monthly value of every workspace sitting on a paid plan.
 *
 * NOT called MRR, deliberately. `byPlan` and `byStatus` are separate tallies, so this cannot
 * exclude a workspace that is canceled or suspended while still carrying a paid plan — it is
 * the list price of what is provisioned, an upper bound on revenue rather than revenue. The
 * label in the UI says so; calling it MRR would be a number that quietly reads too high.
 */
export function planValueEur(byPlan: Record<string, number> | null | undefined): number {
  if (!byPlan || typeof byPlan !== 'object') return 0;
  let total = 0;
  for (const [key, count] of Object.entries(byPlan)) {
    const plan = PLANS[key as PlanKey];
    const n = Number(count);
    if (!plan || !Number.isFinite(n) || n <= 0) continue;
    total += plan.priceMonthlyEUR * n;
  }
  return Math.round(total * 100) / 100;
}

/**
 * What the fleet's AI usage cost, and what it is billable at.
 *
 * `byoKey` is false here on purpose: this is the aggregate over ALL tenants, and a BYO-key
 * tenant contributes 0 to `costMicros` anyway (its calls are never metered). Passing true
 * would zero the whole fleet because one customer brought their own key.
 */
export function fleetAiMoney(costMicros: number): { costMicros: number; owedMicros: number; margin: number } {
  const charge = aiCharge(costMicros, false);
  const margin = charge.billableMicros - charge.costMicros;
  return { costMicros: charge.costMicros, owedMicros: charge.billableMicros, margin };
}

/**
 * Share of workspaces in a paying-or-trialing state, as a percentage.
 *
 * Rounds to a whole number and returns 0 for an empty fleet rather than NaN — a brand-new
 * deployment should read "0%", not "NaN%".
 */
export function healthyShare(byStatus: Record<string, number> | null | undefined): { healthy: number; total: number; pct: number } {
  const s = byStatus && typeof byStatus === 'object' ? byStatus : {};
  const num = (k: string) => (Number.isFinite(Number(s[k])) ? Math.max(0, Number(s[k])) : 0);
  const total = Object.values(s).reduce<number>((a, b) => a + (Number.isFinite(Number(b)) ? Math.max(0, Number(b)) : 0), 0);
  const healthy = num('active') + num('trialing');
  return { healthy, total, pct: total > 0 ? Math.round((healthy / total) * 100) : 0 };
}
