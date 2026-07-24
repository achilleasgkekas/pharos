import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// POST /api/saas/billing/webhook is the ONLY place Stripe's view of a subscription gets
// reflected into Tenant.status/plan — nothing else in the app mutates those fields on the
// billing lifecycle path. It has never had route-level coverage (grep of api/saas/**/*.test.ts
// at the time of writing: zero hits anywhere in the SaaS surface), so a regression here
// silently desyncs a paying tenant's access from what Stripe actually charged/canceled. This
// closes that gap for the four things route-owned logic (not the already-unit-tested pure
// helpers in stripe.ts/statusAudit.ts) is responsible for:
//   - the three-gate ladder (SAAS_MODE off → 404, no webhook secret → 503, bad signature → 400),
//   - tenant resolution (metadata.tenantId first, billingCustomerId fallback, no-match no-op),
//   - the per-event-type Tenant mutation (checkout completed / subscription active / canceled),
//   - that a mid-handler DB throw surfaces as a 500 (so Stripe retries) rather than a
//     silently-swallowed 200.
// Only the DB/config seams are mocked; the real event-type switch and per-handler logic run.

const { connectDBMock, tenantFindById, tenantFindOne, tenantState, saasModeMock, verifySigMock, webhookSecretMock, planForPriceIdMock, recordAuditMock } =
  vi.hoisted(() => {
    const tenantState: { doc: Record<string, unknown> | null } = { doc: null };
    return {
      connectDBMock: vi.fn(async () => {}),
      tenantFindById: vi.fn(async () => tenantState.doc),
      tenantFindOne: vi.fn(async () => tenantState.doc),
      tenantState,
      saasModeMock: vi.fn(() => true),
      verifySigMock: vi.fn(() => true),
      webhookSecretMock: vi.fn(() => 'whsec_test'),
      planForPriceIdMock: vi.fn((_id: string) => null as string | null),
      recordAuditMock: vi.fn(async () => true),
    };
  });

/** Fresh fake Tenant "document" — plain object + a spy `save()`, enough for the route's
 *  field mutations and `tenant.save()` call; no real mongoose document needed. */
function makeTenant(over: Record<string, unknown> = {}) {
  return {
    _id: 't1',
    slug: 'acme',
    status: 'pending',
    plan: 'free',
    billingCustomerId: null as string | null,
    billingSubscriptionId: null as string | null,
    save: vi.fn(async () => undefined),
    ...over,
  };
}

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/Tenant', () => ({ Tenant: { findById: tenantFindById, findOne: tenantFindOne } }));
vi.mock('@/lib/tenancy/saasMode', () => ({ saasMode: saasModeMock }));
vi.mock('@/lib/billing/stripe', () => ({
  verifyStripeSignature: verifySigMock,
  webhookSecret: webhookSecretMock,
}));
vi.mock('@/lib/billing/plans', () => ({ planForPriceId: planForPriceIdMock }));
vi.mock('@/lib/billing/statusAudit', async () => {
  const actual = await vi.importActual<typeof import('@/lib/billing/statusAudit')>('@/lib/billing/statusAudit');
  return actual; // pure — keep the real mapping, it's exactly what we want to exercise
});
vi.mock('@/lib/tenancy/audit', async () => {
  const actual = await vi.importActual<typeof import('@/lib/tenancy/audit')>('@/lib/tenancy/audit');
  return { ...actual, recordAudit: recordAuditMock };
});

import { POST } from './route';

/** Minimal NextRequest stand-in — the route only reads req.text() and headers.get. */
function makeReq(body: unknown, opts: { sig?: string | null; raw?: string } = {}): NextRequest {
  const raw = opts.raw ?? JSON.stringify(body);
  return {
    text: async () => raw,
    headers: { get: (h: string) => (h.toLowerCase() === 'stripe-signature' ? (opts.sig ?? 't=1,v1=x') : null) },
  } as unknown as NextRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
  tenantState.doc = null;
  saasModeMock.mockImplementation(() => true);
  verifySigMock.mockImplementation(() => true);
  webhookSecretMock.mockImplementation(() => 'whsec_test');
  planForPriceIdMock.mockImplementation(() => null);
  recordAuditMock.mockImplementation(async () => true);
  connectDBMock.mockImplementation(async () => {});
  tenantFindById.mockImplementation(async () => tenantState.doc);
  tenantFindOne.mockImplementation(async () => tenantState.doc);
});

describe('gate ladder', () => {
  it('SAAS_MODE off → 404, never touches the DB', async () => {
    saasModeMock.mockReturnValue(false);
    const res = await POST(makeReq({ type: 'checkout.session.completed', data: { object: {} } }));
    expect(res.status).toBe(404);
    expect(connectDBMock).not.toHaveBeenCalled();
  });

  it('no webhook secret configured → 503, never touches the DB', async () => {
    webhookSecretMock.mockReturnValue('');
    const res = await POST(makeReq({ type: 'checkout.session.completed', data: { object: {} } }));
    expect(res.status).toBe(503);
    expect(connectDBMock).not.toHaveBeenCalled();
  });

  it('bad/missing signature → 400, never touches the DB', async () => {
    verifySigMock.mockReturnValue(false);
    const res = await POST(makeReq({ type: 'checkout.session.completed', data: { object: {} } }, { sig: null }));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toMatch(/signature/i);
    expect(connectDBMock).not.toHaveBeenCalled();
  });

  it('signature ok but body is not valid JSON → 400 Invalid JSON', async () => {
    const res = await POST(makeReq({}, { raw: '{not json' }));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toMatch(/invalid json/i);
    expect(connectDBMock).not.toHaveBeenCalled();
  });

  it('unhandled event type → 200 received:true, no Tenant lookup', async () => {
    const res = await POST(makeReq({ type: 'invoice.paid', data: { object: {} } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect(tenantFindById).not.toHaveBeenCalled();
    expect(tenantFindOne).not.toHaveBeenCalled();
  });

  it('a mid-handler DB throw surfaces as 500 (so Stripe retries), signature already validated', async () => {
    tenantFindById.mockRejectedValueOnce(new Error('mongo blip'));
    const res = await POST(
      makeReq({ type: 'checkout.session.completed', data: { object: { metadata: { tenantId: '507f1f77bcf86cd799439011' } } } })
    );
    expect(res.status).toBe(500);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('mongo blip');
  });
});

describe('tenant resolution', () => {
  it('prefers metadata.tenantId (valid ObjectId) over the customer id', async () => {
    const tenant = makeTenant({ status: 'pending' });
    tenantState.doc = tenant;
    await POST(
      makeReq({
        type: 'checkout.session.completed',
        data: { object: { metadata: { tenantId: '507f1f77bcf86cd799439011' }, customer: 'cus_1' } },
      })
    );
    expect(tenantFindById).toHaveBeenCalledWith('507f1f77bcf86cd799439011');
    expect(tenantFindOne).not.toHaveBeenCalled();
  });

  it('falls back to billingCustomerId when metadata.tenantId is absent/malformed', async () => {
    const tenant = makeTenant({ status: 'pending' });
    tenantState.doc = tenant;
    await POST(makeReq({ type: 'checkout.session.completed', data: { object: { customer: 'cus_1' } } }));
    expect(tenantFindById).not.toHaveBeenCalled();
    expect(tenantFindOne).toHaveBeenCalledWith({ billingCustomerId: 'cus_1' });
  });

  it('no resolvable tenant → handler no-ops, still 200, no save', async () => {
    tenantState.doc = null;
    const res = await POST(makeReq({ type: 'checkout.session.completed', data: { object: { customer: 'cus_missing' } } }));
    expect(res.status).toBe(200);
  });
});

describe('checkout.session.completed', () => {
  it('activates the tenant and stores the customer/subscription ids', async () => {
    const tenant = makeTenant({ status: 'pending' });
    tenantState.doc = tenant;
    await POST(
      makeReq({
        type: 'checkout.session.completed',
        data: { object: { metadata: { tenantId: '507f1f77bcf86cd799439011' }, customer: 'cus_1', subscription: 'sub_1' } },
      })
    );
    expect(tenant.billingCustomerId).toBe('cus_1');
    expect(tenant.billingSubscriptionId).toBe('sub_1');
    expect(tenant.status).toBe('active');
    expect(tenant.save).toHaveBeenCalledTimes(1);
    // pending → active is normal onboarding, not a "reactivation" — statusAuditAction is null.
    expect(recordAuditMock).not.toHaveBeenCalled();
  });

  it('records workspace.reactivated when a previously-suspended tenant checks out again', async () => {
    const tenant = makeTenant({ status: 'suspended' });
    tenantState.doc = tenant;
    await POST(
      makeReq({
        type: 'checkout.session.completed',
        data: { object: { metadata: { tenantId: '507f1f77bcf86cd799439011' }, customer: 'cus_1' } },
      })
    );
    expect(tenant.status).toBe('active');
    expect(recordAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 't1' }),
      expect.objectContaining({ action: 'workspace.reactivated' })
    );
  });
});

describe('customer.subscription.created / updated', () => {
  it('maps the subscription price to a plan and activates on an active Stripe status', async () => {
    const tenant = makeTenant({ status: 'pending', plan: 'free' });
    tenantState.doc = tenant;
    planForPriceIdMock.mockReturnValue('shared');
    await POST(
      makeReq({
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_1',
            customer: 'cus_1',
            status: 'active',
            items: { data: [{ price: { id: 'price_shared' } }] },
          },
        },
      })
    );
    expect(planForPriceIdMock).toHaveBeenCalledWith('price_shared');
    expect(tenant.plan).toBe('shared');
    expect(tenant.status).toBe('active');
    expect(tenant.billingSubscriptionId).toBe('sub_1');
  });

  it('trialing counts as active', async () => {
    const tenant = makeTenant({ status: 'pending' });
    tenantState.doc = tenant;
    await POST(
      makeReq({
        type: 'customer.subscription.created',
        data: { object: { id: 'sub_1', customer: 'cus_1', status: 'trialing', items: { data: [] } } },
      })
    );
    expect(tenant.status).toBe('active');
  });

  it('past_due suspends the tenant and audits workspace.suspended', async () => {
    const tenant = makeTenant({ status: 'active' });
    tenantState.doc = tenant;
    await POST(
      makeReq({
        type: 'customer.subscription.updated',
        data: { object: { id: 'sub_1', customer: 'cus_1', status: 'past_due', items: { data: [] } } },
      })
    );
    expect(tenant.status).toBe('suspended');
    expect(recordAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 't1' }),
      expect.objectContaining({ action: 'workspace.suspended' })
    );
  });

  it('unpaid also suspends the tenant', async () => {
    const tenant = makeTenant({ status: 'active' });
    tenantState.doc = tenant;
    await POST(
      makeReq({
        type: 'customer.subscription.created',
        data: { object: { id: 'sub_1', customer: 'cus_1', status: 'unpaid', items: { data: [] } } },
      })
    );
    expect(tenant.status).toBe('suspended');
  });

  it('an unmapped price id leaves the current plan untouched', async () => {
    const tenant = makeTenant({ status: 'active', plan: 'shared' });
    tenantState.doc = tenant;
    planForPriceIdMock.mockReturnValue(null);
    await POST(
      makeReq({
        type: 'customer.subscription.updated',
        data: { object: { id: 'sub_1', customer: 'cus_1', status: 'active', items: { data: [{ price: { id: 'price_unknown' } }] } } },
      })
    );
    expect(tenant.plan).toBe('shared');
  });
});

describe('customer.subscription.deleted', () => {
  it('cancels the tenant, drops it to the free plan, and audits workspace.canceled', async () => {
    const tenant = makeTenant({ status: 'active', plan: 'shared' });
    tenantState.doc = tenant;
    await POST(makeReq({ type: 'customer.subscription.deleted', data: { object: { customer: 'cus_1' } } }));
    expect(tenant.status).toBe('canceled');
    expect(tenant.plan).toBe('free');
    expect(recordAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 't1' }),
      expect.objectContaining({ action: 'workspace.canceled' })
    );
    // The shared→free plan drop is ALSO audited (its own 'plan.changed' verb), so both the
    // plan-change and status-change legs fire — two separate audit rows for one event.
    expect(recordAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 't1' }),
      expect.objectContaining({ action: 'plan.changed', meta: { from: 'shared', to: 'free' } })
    );
    expect(recordAuditMock).toHaveBeenCalledTimes(2);
  });

  it('already-canceled → already-free is a no-op (no duplicate audit row)', async () => {
    const tenant = makeTenant({ status: 'canceled', plan: 'free' });
    tenantState.doc = tenant;
    await POST(makeReq({ type: 'customer.subscription.deleted', data: { object: { customer: 'cus_1' } } }));
    expect(recordAuditMock).not.toHaveBeenCalled();
  });
});
