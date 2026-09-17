import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// GET /api/calendar.ics — the token-in-URL iCal feed. #121: in SaaS mode a hosted customer has no
// `User`, so the token lookup and the agenda would run on the DEFAULT connection, outside every
// workspace. The route must refuse there BEFORE any database access; self-hosted is unchanged.

const { saas, connectDB, userFindOne, agenda } = vi.hoisted(() => ({
  saas: { on: false },
  connectDB: vi.fn(async () => {}),
  userFindOne: vi.fn(() => ({ select: () => ({ lean: async () => ({ _id: 'u1' }) }) })),
  agenda: vi.fn(async () => ({ months: [] })),
}));

vi.mock('@/lib/tenancy/saasMode', () => ({ saasMode: () => saas.on }));
vi.mock('@/lib/db', () => ({ connectDB }));
vi.mock('@/models/User', () => ({ User: { findOne: userFindOne } }));
vi.mock('@/lib/moneyAgenda', () => ({ computeMoneyAgenda: agenda }));
vi.mock('@/lib/appSettings', () => ({ getAppSettings: async () => ({ currency: 'EUR' }) }));

import { GET } from './route';

const req = (token: string) => ({ nextUrl: new URL(`https://x.test/api/calendar.ics?token=${token}`) }) as unknown as NextRequest;

beforeEach(() => {
  vi.clearAllMocks();
  saas.on = false;
});

describe('GET /api/calendar.ics', () => {
  it('SaaS mode: 404 without touching the database (#121)', async () => {
    saas.on = true;
    const res = await GET(req('phcal_valid'));
    expect(res.status).toBe(404);
    expect(connectDB).not.toHaveBeenCalled();
    expect(userFindOne).not.toHaveBeenCalled();
    expect(agenda).not.toHaveBeenCalled();
  });

  it('self-hosted: a valid token still gets the feed', async () => {
    const res = await GET(req('phcal_valid'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/calendar');
    expect(userFindOne).toHaveBeenCalledWith({ calendarToken: 'phcal_valid' });
  });

  it('self-hosted: missing or unknown token is 401', async () => {
    expect((await GET(req(''))).status).toBe(401);
    userFindOne.mockReturnValueOnce({ select: () => ({ lean: async () => null }) } as never);
    expect((await GET(req('nope'))).status).toBe(401);
  });
});
