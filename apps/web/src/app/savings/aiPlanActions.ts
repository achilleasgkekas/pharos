'use server';
// "Plan it with AI" on a savings goal: 3-5 concrete steps with amounts and the month the goal
// is reached. The AI sees the figures the Save page already measures (a normal month's income
// and spend, spend by category, subscriptions, installments that end) and nothing else.
// The steps can then go to Tasks with one click.
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { assertCanWrite, requireUser } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { isFeatureEnabled } from '@/lib/aiFeatures.server';
import { withRequestTenant } from '@/lib/tenancy/request';
import { currentModel } from '@/lib/tenancy/connection';
import { runTextJSON } from '@/lib/ollama';
import { planForTarget } from '@/lib/savingsPlan';
import { Expense as ExpenseModel } from '@/models/Expense';
import { Task as TaskModel } from '@/models/Task';
import { getAppSettings } from '@/lib/appSettings';
import { loadSavingsData } from './data';

export type AiPlanStep = { title: string; detail: string; perMonth: number | null };
export type AiPlan = { summary: string; reachBy: string | null; steps: AiPlanStep[] };

const PlanSchema = z.object({
  summary: z.string().max(600).catch(''),
  reachBy: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .nullable()
    .catch(null),
  steps: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(120),
        detail: z.string().trim().max(400).catch(''),
        perMonth: z.coerce.number().nonnegative().nullable().catch(null),
      })
    )
    .max(5)
    .catch([]),
});

const InputSchema = z.object({
  goalId: z.string().regex(/^[a-f0-9]{24}$/i).optional(),
  title: z.string().max(120).optional(),
  target: z.number().positive().finite().optional(),
  targetDate: z.string().max(40).nullable().optional(),
  question: z.string().max(500).optional(),
  previous: PlanSchema.nullable().optional(),
  locale: z.string().max(5).optional(),
});
export type AiPlanInput = z.input<typeof InputSchema>;

const LANGUAGE: Record<string, string> = { en: 'English', el: 'Greek', de: 'German', es: 'Spanish', fr: 'French', it: 'Italian', nl: 'Dutch', pt: 'Portuguese' };

const PROMPT = `You help a household reach a savings goal. You get JSON with the goal, what a normal month looks like (income, spend, what is left), spend by category over the last three months, subscriptions with their monthly cost, and card installments with the months they still run. Return ONLY JSON, no markdown:
{ "summary": "two short sentences: where they stand and the plan in one line", "reachBy": "YYYY-MM or null", "steps": [ { "title": "a short action", "detail": "one or two sentences: what exactly to do", "perMonth": <money per month this frees or puts aside, or null> } ] }
Rules:
- 3 to 5 steps, most effective first. Each step is one thing a person can actually do, like "Put 150 aside on payday", "Cancel Disney+", "Cook at home two more nights a week".
- Use only the figures given. Name real subscriptions and categories from the data; never invent a cost, a provider or an income.
- When an installment ends, say that its monthly amount can go to the goal from that month.
- Keep it realistic: do not cut rent, utilities or health. Prefer small cuts in several places over one big sacrifice.
- "reachBy" is the month the goal is reached if they follow the steps, from the numbers; null if it cannot be reached within 5 years.
- If there is a follow-up question, answer it by adjusting the previous plan, and return the full plan again.
- Write in the language you are told, with amounts as "<number> <currency>".`;

const round = (n: number) => Math.round(n * 100) / 100;

/** Average monthly spend per category over the last three complete months. */
async function spendByCategory(): Promise<{ category: string; perMonth: number }[]> {
  const Expense = await currentModel(ExpenseModel);
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - 3, 1);
  const to = new Date(now.getFullYear(), now.getMonth(), 1);
  const rows = await Expense.aggregate<{ _id: string; total: number }>([
    { $match: { kind: { $ne: 'income' }, amount: { $gt: 0 }, date: { $gte: from, $lt: to } } },
    { $group: { _id: '$category', total: { $sum: '$amount' } } },
    { $sort: { total: -1 } },
    { $limit: 12 },
  ]);
  return rows.map((r) => ({ category: r._id || 'other', perMonth: round(r.total / 3) })).filter((r) => r.perMonth > 0);
}

export async function aiSavingsPlan(input: AiPlanInput): Promise<{ ok: true; plan: AiPlan } | { ok: false; error: string }> {
  await requireUser();
  const parsed = InputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Invalid request' };
  const p = parsed.data;
  return withRequestTenant(async () => {
    if (!(await isFeatureEnabled('savingsPlan'))) return { ok: false as const, error: 'The savings plan (AI) is turned off. Turn it on in Settings → AI.' };
    await connectDB();
    const [data, settings] = await Promise.all([loadSavingsData(), getAppSettings()]);
    const goal = p.goalId ? data.goals.find((g) => g._id === p.goalId) : null;
    if (p.goalId && !goal) return { ok: false as const, error: 'Goal not found' };
    const target = goal ? goal.target : p.target ?? 0;
    if (!(target > 0)) return { ok: false as const, error: 'Enter an amount first' };
    const saved = goal ? goal.saved : 0;
    const targetDate = goal ? goal.targetDate : p.targetDate ?? null;
    const engine = planForTarget({ target, saved, targetDate, baseline: data.baseline, projection: data.projection });

    const facts = {
      today: new Date().toISOString().slice(0, 10),
      currency: settings.currency || 'EUR',
      goal: { title: goal?.title || p.title || 'Savings goal', target, saved, remaining: engine.remaining, targetDate: targetDate?.slice(0, 10) ?? null },
      normalMonth: { income: data.baseline.income, spend: data.baseline.spend, left: data.baseline.net, measuredOverMonths: data.baseline.months },
      balanceNow: data.hasAccounts ? data.startBalance : null,
      engine: {
        verdict: engine.verdict,
        neededPerMonth: engine.requiredPerMonth,
        sparePerMonth: engine.affordablePerMonth,
        shortPerMonth: engine.shortfallPerMonth,
        earliestAtCurrentRate: engine.earliest?.slice(0, 7) ?? null,
      },
      spendByCategory: await spendByCategory(),
      subscriptions: data.levers.slice(0, 12),
      installmentsEnding: data.obligations.slice(0, 10),
    };
    const followUp = p.question?.trim()
      ? `\n\nPrevious plan: ${JSON.stringify(p.previous ?? null)}\nFollow-up question: ${p.question.trim()}`
      : '';
    try {
      const { json } = await runTextJSON(
        PROMPT,
        `Language: ${LANGUAGE[p.locale || 'en'] ?? 'English'}\n\n${JSON.stringify(facts)}${followUp}`,
        { feature: 'savingsPlan', trigger: 'user', ...(goal ? { record: { type: 'goal', id: goal._id } } : {}) }
      );
      const plan = PlanSchema.parse(json);
      if (!plan.steps.length) return { ok: false as const, error: 'The AI returned no steps' };
      return { ok: true as const, plan: { summary: plan.summary.trim(), reachBy: plan.reachBy, steps: plan.steps.slice(0, 5) } };
    } catch (err) {
      const msg = (err as Error).message || String(err);
      return { ok: false as const, error: /ECONNREFUSED|fetch failed|ENOTFOUND/i.test(msg) ? 'AI not reachable (check the AI provider)' : `AI failed: ${msg.slice(0, 140)}` };
    }
  });
}

/** Put the plan's steps on the task list, one task each, tagged "savings". */
export async function addPlanStepsAsTasks(input: { goalTitle: string; steps: AiPlanStep[] }): Promise<{ ok: boolean; created: number }> {
  await assertCanWrite();
  const steps = (Array.isArray(input?.steps) ? input.steps : []).slice(0, 5);
  const goalTitle = String(input?.goalTitle || '').trim().slice(0, 120);
  return withRequestTenant(async () => {
    await connectDB();
    const Task = await currentModel(TaskModel);
    const docs = steps
      .map((s) => ({ title: String(s?.title || '').trim().slice(0, 200), detail: String(s?.detail || '').trim().slice(0, 1000) }))
      .filter((s) => s.title)
      .map((s) => ({
        title: s.title,
        description: [s.detail, goalTitle ? `🎯 ${goalTitle}` : ''].filter(Boolean).join('\n\n'),
        tags: ['savings'],
      }));
    if (docs.length) await Task.create(docs);
    revalidatePath('/tasks');
    return { ok: docs.length > 0, created: docs.length };
  });
}
