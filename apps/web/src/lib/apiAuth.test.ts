import { describe, it, expect } from 'vitest';
import { apiError } from '@/lib/apiAuth';

// `apiError` is the shared error-response builder used by every /api/v1 route
// (see withAuth's 401/500 paths and each handler's validation branches). It must
// always produce a JSON body of exactly { error: <message> } with the given status,
// defaulting to 400. These tests pin that contract so a change in shape (e.g. a
// renamed field or a different default) is caught before it reaches API clients,
// which parse `error` off failed responses.

describe('apiError', () => {
  it('defaults to HTTP 400', () => {
    expect(apiError('bad request').status).toBe(400);
  });

  it('wraps the message under an `error` key', async () => {
    const res = apiError('missing field');
    expect(await res.json()).toEqual({ error: 'missing field' });
  });

  it('honours an explicit status code', () => {
    expect(apiError('nope', 401).status).toBe(401);
    expect(apiError('forbidden', 403).status).toBe(403);
    expect(apiError('not found', 404).status).toBe(404);
    expect(apiError('boom', 500).status).toBe(500);
  });

  it('keeps body and status independent', async () => {
    const res = apiError('unauthorized', 401);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthorized' });
  });

  it('serialises as application/json', () => {
    const res = apiError('x');
    expect(res.headers.get('content-type')).toMatch(/application\/json/);
  });

  it('preserves an empty message string (no coercion to a default)', async () => {
    const res = apiError('');
    expect(await res.json()).toEqual({ error: '' });
    expect(res.status).toBe(400);
  });

  it('passes non-ASCII / Greek messages through verbatim', async () => {
    const msg = 'Μη έγκυρο αίτημα · ελέγξτε τα πεδία';
    expect(await apiError(msg).json()).toEqual({ error: msg });
  });

  it('does not leak extra keys beyond `error`', async () => {
    const body = await apiError('only error', 422).json();
    expect(Object.keys(body)).toEqual(['error']);
  });

  it('returns a fresh response object on each call', async () => {
    const a = apiError('first', 400);
    const b = apiError('second', 404);
    expect(a).not.toBe(b);
    expect(a.status).toBe(400);
    expect(b.status).toBe(404);
    expect(await a.json()).toEqual({ error: 'first' });
    expect(await b.json()).toEqual({ error: 'second' });
  });
});
