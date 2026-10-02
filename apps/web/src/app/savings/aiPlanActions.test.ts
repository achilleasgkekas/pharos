import { describe, it, expect, vi, beforeEach } from 'vitest';

// app/savings/aiPlanActions.ts: the AI savings plan and "steps to Tasks". Mocks the DB, the
// AI call and the page's data loader; the planning engine (lib/savingsPlan) runs for real so
// the figures handed to the AI are the ones the page shows.
const { runTextJSON, featureOn, taskCreate, aggregate, loadData } = vi.hoisted(() => ({
  runTextJSON: vi.fn(),
  featureOn: vi.fn(async () => true),
  taskCreate: vi.fn(async (docs: unknown) => docs),
  aggregate: vi.fn(async () => [{ _id: 'food', total: 900 }, { _id: 'fun', total: 300 }]),
  loadData: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ connectDB: async () => {} }));
vi.mock('@/lib/auth', () => ({ assertCanWrite: async () => undefined, requireUser: async () => undefined }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('@/lib/tenancy/request', () => ({ withRequestTenant: async (fn: () => Promise<unknown>) => fn() }));
vi.mock('@/lib/tenancy/connection', () => ({ currentModel: async (m: unknown) => m }));
vi.mock('@/lib/aiFeatures.server', () => ({ isFeatureEnabled: featureOn }));
vi.mock('@/lib/ollama', () => ({ runTextJSON }));
vi.mock('@/lib/appSettings', () => ({ getAppSettings: async () => ({ currency: 'EUR' }) }));
vi.mock('@/models/Expense', () => ({ Expense: { aggregate } }));
vi.mock('@/models/Task', () => ({ Task: { create: taskCreate } }));
vi.mock('./data', () => ({ loadSavingsData: loadData }));

import { aiSavingsPlan, addPlanStepsAsTasks } from './aiPlanActions';

const GOAL = '0123456789abcdef01234567';

beforeEach(() => {
  vi.clearAllMocks();
  loadData.mockResolvedValue({
    baseline: { basis: 'history', months: 6, incomeMonths: 6, income: 2000, spend: 1800, net: 200 },
    projection: [],
    startBalance: 0,
    hasAccounts: false,
    obligations: [{ label: 'PLAISIO', perMonth: 53.4, monthsRemaining: 7 }],
    levers: [{ label: 'Netflix', perMonth: 13.99 }],
    goals: [{ _id: GOAL, title: 'Holiday', target: 3000, saved: 600, targetDate: '2027-07-01T00:00:00.000Z' }],
    history: [],
  });
  runTextJSON.mockResolvedValue({
    json: { summary: 'You can make it.', reachBy: '2027-06', steps: [{ title: 'Put 200 aside', detail: 'On payday.', perMonth: 200 }, { title: 'Cancel Netflix', perMonth: '13.99' }] },
  });
});

describe('aiSavingsPlan', () => {
  it('sends the goal, a normal month, categories, subscriptions and installments', async () => {
    const r = await aiSavingsPlan({ goalId: GOAL, locale: 'el' });
    expect(r).toEqual({
      ok: true,
      plan: { summary: 'You can make it.', reachBy: '2027-06', steps: [{ title: 'Put 200 aside', detail: 'On payday.', perMonth: 200 }, { title: 'Cancel Netflix', detail: '', perMonth: 13.99 }] },
    });
    const [, user, opts] = runTextJSON.mock.calls[0];
    expect(user).toContain('Language: Greek');
    const facts = JSON.parse(user.split('\n\n')[1]);
    expect(facts.goal).toMatchObject({ title: 'Holiday', target: 3000, saved: 600, remaining: 2400, targetDate: '2027-07-01' });
    expect(facts.normalMonth).toMatchObject({ income: 2000, spend: 1800, left: 200 });
    expect(facts.spendByCategory).toEqual([{ category: 'food', perMonth: 300 }, { category: 'fun', perMonth: 100 }]);
    expect(facts.subscriptions[0].label).toBe('Netflix');
    expect(facts.installmentsEnding[0].label).toBe('PLAISIO');
    expect(opts).toMatchObject({ feature: 'savingsPlan', trigger: 'user', record: { type: 'goal', id: GOAL } });
  });

  it('passes the previous plan with a follow-up question', async () => {
    const previous = { summary: 's', reachBy: null, steps: [{ title: 'a', detail: '', perMonth: null }] };
    await aiSavingsPlan({ goalId: GOAL, question: 'What if I keep Netflix?', previous });
    expect(runTextJSON.mock.calls[0][1]).toContain('Follow-up question: What if I keep Netflix?');
  });

  it('plans an amount that is not a goal yet', async () => {
    const r = await aiSavingsPlan({ target: 5000, targetDate: '2027-10-01' });
    expect(r.ok).toBe(true);
    expect(runTextJSON.mock.calls[0][2].record).toBeUndefined();
  });

  it('stops when the feature is off, the goal is unknown or there is no amount', async () => {
    featureOn.mockResolvedValueOnce(false);
    expect((await aiSavingsPlan({ goalId: GOAL })).ok).toBe(false);
    expect(await aiSavingsPlan({ goalId: 'ffffffffffffffffffffffff' })).toEqual({ ok: false, error: 'Goal not found' });
    expect((await aiSavingsPlan({})).ok).toBe(false);
    expect(runTextJSON).not.toHaveBeenCalled();
  });

  it('reports an empty answer and an unreachable provider', async () => {
    runTextJSON.mockResolvedValueOnce({ json: { steps: [] } });
    expect(await aiSavingsPlan({ goalId: GOAL })).toEqual({ ok: false, error: 'The AI returned no steps' });
    runTextJSON.mockRejectedValueOnce(new Error('fetch failed'));
    expect(await aiSavingsPlan({ goalId: GOAL })).toEqual({ ok: false, error: 'AI not reachable (check the AI provider)' });
  });
});

describe('addPlanStepsAsTasks', () => {
  it('creates one task per step, tagged savings, naming the goal', async () => {
    const r = await addPlanStepsAsTasks({ goalTitle: 'Holiday', steps: [{ title: 'Put 200 aside', detail: 'On payday.', perMonth: 200 }, { title: '  ', detail: '', perMonth: null }] });
    expect(r).toEqual({ ok: true, created: 1 });
    expect(taskCreate).toHaveBeenCalledWith([{ title: 'Put 200 aside', description: 'On payday.\n\n🎯 Holiday', tags: ['savings'] }]);
  });

  it('does nothing without steps', async () => {
    expect(await addPlanStepsAsTasks({ goalTitle: '', steps: [] })).toEqual({ ok: false, created: 0 });
    expect(taskCreate).not.toHaveBeenCalled();
  });
});
