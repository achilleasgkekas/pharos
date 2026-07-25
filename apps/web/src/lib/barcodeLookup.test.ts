import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { lookupBarcode, BARCODE_SOURCES } from './barcodeLookup';

// P17 (server half) — the source-fan-out behaviour behind GET /api/v1/lookup/barcode.
// Only the network seam is mocked (global fetch); the real barcode helpers run.
// The distinctions worth locking down, because each one is a different answer
// the mobile client must render differently:
//   - a hit anywhere            → the product, reported under the SCANNED code
//   - every source said 404/0   → ok with product:null ("nobody knows it")
//   - every source threw        → NOT ok ("we could not ask") → 502, not a miss
//   - an invalid GTIN           → NOT ok, and zero requests are spent on it
//   - one source down           → must not hide another source's hit

const EAN13 = '3017620422003';
const UPCA = '049000006346';

type Handler = (url: string) => { status?: number; body?: unknown } | Promise<{ status?: number; body?: unknown }>;

let calls: string[] = [];

function mockFetch(handler: Handler) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      calls.push(String(url));
      const { status = 200, body = {} } = await handler(String(url));
      return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
      } as unknown as Response;
    })
  );
}

const found = (name: string) => ({ status: 1, product: { product_name: name, brands: 'Ferrero' } });

beforeEach(() => {
  calls = [];
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('lookupBarcode', () => {
  it('rejects an invalid GTIN without spending a request', async () => {
    mockFetch(() => ({ body: found('never') }));
    const r = await lookupBarcode('3017620422004');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Invalid barcode/);
    expect(calls).toHaveLength(0);
  });

  it('returns the product from the first source that has it', async () => {
    mockFetch((url) => (url.includes('openfoodfacts') ? { body: found('Nutella') } : { status: 404 }));
    const r = await lookupBarcode(EAN13);
    expect(r).toMatchObject({ ok: true, code: EAN13 });
    if (r.ok) expect(r.product).toMatchObject({ name: 'Nutella', brand: 'Ferrero', code: EAN13, source: 'openfoodfacts' });
  });

  it('falls through to the non-food catalogues', async () => {
    mockFetch((url) => (url.includes('openproductsfacts') ? { body: found('USB-C cable') } : { status: 404 }));
    const r = await lookupBarcode(EAN13);
    if (r.ok) expect(r.product).toMatchObject({ name: 'USB-C cable', source: 'openproductsfacts' });
    expect(calls).toHaveLength(BARCODE_SOURCES.length);
  });

  it('prefers the food catalogue when more than one answers', async () => {
    mockFetch((url) => ({ body: found(url.includes('openfoodfacts') ? 'Food hit' : 'Other hit') }));
    const r = await lookupBarcode(EAN13);
    if (r.ok) expect(r.product?.name).toBe('Food hit');
  });

  it('reports a clean miss when every source answers "no such barcode"', async () => {
    mockFetch(() => ({ status: 404 }));
    const r = await lookupBarcode(EAN13);
    expect(r).toEqual({ ok: true, product: null, code: EAN13 });
  });

  it('treats status:0 in a 200 body as a miss too', async () => {
    mockFetch(() => ({ body: { status: 0, status_verbose: 'product not found' } }));
    const r = await lookupBarcode(EAN13);
    expect(r).toEqual({ ok: true, product: null, code: EAN13 });
  });

  it('reports unreachable (not a miss) when every source fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ENOTFOUND'); }));
    const r = await lookupBarcode(EAN13);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/unreachable.*ENOTFOUND/);
  });

  it('counts a 5xx as a transport failure, not a miss', async () => {
    mockFetch(() => ({ status: 503 }));
    const r = await lookupBarcode(EAN13);
    expect(r.ok).toBe(false);
  });

  it('does not let one broken source hide another source hit', async () => {
    mockFetch((url) => {
      if (url.includes('openfoodfacts')) throw new Error('boom');
      return url.includes('openproductsfacts') ? { body: found('Router') } : { status: 404 };
    });
    const r = await lookupBarcode(EAN13);
    if (r.ok) expect(r.product?.name).toBe('Router');
  });

  it('retries the zero-padded form of a UPC-A and still reports the scanned code', async () => {
    mockFetch((url) => (url.includes(`/0${UPCA}.json`) ? { body: found('Coke') } : { status: 404 }));
    const r = await lookupBarcode(UPCA);
    expect(r).toMatchObject({ ok: true, code: UPCA });
    if (r.ok) expect(r.product).toMatchObject({ name: 'Coke', code: UPCA });
    // First form missed everywhere, so the padded form cost a second round.
    expect(calls.length).toBeGreaterThan(BARCODE_SOURCES.length);
  });

  it('asks for a field-filtered record and identifies itself', async () => {
    mockFetch(() => ({ body: found('X') }));
    await lookupBarcode(EAN13);
    expect(calls[0]).toContain(`/api/v2/product/${EAN13}.json?fields=`);
    const init = (fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0][1];
    expect((init.headers as Record<string, string>)['User-Agent']).toMatch(/^Pharos\//);
  });

  it('tolerates the separators a user types by hand', async () => {
    mockFetch(() => ({ body: found('Nutella') }));
    const r = await lookupBarcode(' 301-762-042-2003 ');
    expect(r).toMatchObject({ ok: true, code: EAN13 });
  });
});
