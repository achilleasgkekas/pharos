import { afterEach, describe, expect, it, vi } from 'vitest';

const { assertPublicUrlMock } = vi.hoisted(() => ({
  assertPublicUrlMock: vi.fn(async (url: string) => {
    if (new URL(url).hostname === '169.254.169.254') throw new Error('Private address not allowed');
  }),
}));
vi.mock('./ssrf', () => ({ assertPublicUrl: assertPublicUrlMock }));

import { safeFetch } from './safeFetch';

const redirect = (status: number, location: string) => new Response(null, { status, headers: { location } });

afterEach(() => {
  vi.unstubAllGlobals();
  assertPublicUrlMock.mockClear();
});

describe('safeFetch', () => {
  it('checks the first URL and never lets fetch follow redirects on its own', async () => {
    const fetchMock = vi.fn(async () => new Response('ok'));
    vi.stubGlobal('fetch', fetchMock);
    const res = await safeFetch('https://shop.example/p', { headers: { Accept: 'text/html' } });
    expect(await res.text()).toBe('ok');
    expect(assertPublicUrlMock).toHaveBeenCalledWith('https://shop.example/p');
    expect(fetchMock).toHaveBeenCalledWith('https://shop.example/p', expect.objectContaining({ redirect: 'manual' }));
  });

  it('refuses a redirect to a private address instead of fetching it', async () => {
    const fetchMock = vi.fn(async () => redirect(302, 'http://169.254.169.254/latest/meta-data/'));
    vi.stubGlobal('fetch', fetchMock);
    await expect(safeFetch('https://evil.example/')).rejects.toThrow(/Private address/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('follows a public relative redirect, checking the new target', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(redirect(301, '/new')).mockResolvedValueOnce(new Response('moved'));
    vi.stubGlobal('fetch', fetchMock);
    const res = await safeFetch('https://shop.example/old');
    expect(await res.text()).toBe('moved');
    expect(assertPublicUrlMock).toHaveBeenLastCalledWith('https://shop.example/new');
  });

  it('turns a POST into a GET after a 303, like fetch does', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(redirect(303, 'https://hooks.example/done')).mockResolvedValueOnce(new Response('ok'));
    vi.stubGlobal('fetch', fetchMock);
    await safeFetch('https://hooks.example/in', { method: 'POST', body: '{}' });
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: 'GET', body: undefined });
  });

  it('gives up after too many redirects', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => redirect(302, 'https://loop.example/')));
    await expect(safeFetch('https://loop.example/', {}, 2)).rejects.toThrow(/Too many redirects/);
  });
});
