import { describe, it, expect } from 'vitest';
import { NextResponse } from 'next/server';
import { saasGuard } from '@/lib/tenancy/saasApi';

// `saasGuard` wraps a SaaS route handler body so an unexpected throw (e.g. a DB failure
// mid-handler) becomes a uniform JSON `{ error }` 500 instead of Next's default HTML 500,
// mirroring the catch in the v1 `withAuth` wrapper. These tests pin that contract:
// deliberate responses pass through untouched, and only a thrown error is turned into a 500.

describe('saasGuard', () => {
  it('passes a handler response through untouched (happy path)', async () => {
    const res = await saasGuard(async () => NextResponse.json({ ok: true }, { status: 201 }));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('passes a deliberate short-circuit (e.g. a gate 404) through untouched', async () => {
    const res = await saasGuard(async () =>
      NextResponse.json({ error: 'SaaS mode is not enabled' }, { status: 404 })
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'SaaS mode is not enabled' });
  });

  it('turns a thrown Error into a JSON 500 with its message', async () => {
    const res = await saasGuard(async () => {
      throw new Error('db exploded');
    });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'db exploded' });
  });

  it('truncates the error message to 200 chars', async () => {
    const long = 'x'.repeat(500);
    const res = await saasGuard(async () => {
      throw new Error(long);
    });
    const body = (await res.json()) as { error: string };
    expect(body.error.length).toBe(200);
  });

  it('falls back to "Server error" when the thrown error has no message', async () => {
    const res = await saasGuard(async () => {
      throw new Error('');
    });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Server error' });
  });

  it('does not leak keys beyond `error` on the 500 path', async () => {
    const res = await saasGuard(async () => {
      throw new Error('boom');
    });
    const body = await res.json();
    expect(Object.keys(body)).toEqual(['error']);
  });
});
