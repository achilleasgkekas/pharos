import { describe, it, expect, vi, beforeEach } from 'vitest';

// setLocale persists the UI language cookie the layout reads on next render. Behaviour pinned:
//  - an unsupported locale code is rejected BEFORE touching cookies() at all (no cookie write,
//    no revalidate) — a typo/garbage query param can't silently set a bogus cookie.
//  - a supported locale is written to cookies() with the exact options (path/maxAge/sameSite)
//    the layout's cookie reader expects, then revalidatePath('/', 'layout') runs so the
//    server-rendered <html lang> / translated strings pick it up on the very next request.

const { cookiesSetMock, cookiesMock, revalidatePathMock } = vi.hoisted(() => ({
  cookiesSetMock: vi.fn(),
  cookiesMock: vi.fn(async () => ({ set: cookiesSetMock })),
  revalidatePathMock: vi.fn(),
}));

vi.mock('next/headers', () => ({ cookies: cookiesMock }));
vi.mock('next/cache', () => ({ revalidatePath: revalidatePathMock }));

import { setLocale } from './i18nActions';
import { LOCALE_COOKIE } from '@/lib/i18n/config';

beforeEach(() => {
  vi.clearAllMocks();
  cookiesMock.mockImplementation(async () => ({ set: cookiesSetMock }));
});

describe('setLocale', () => {
  it('rejects an unsupported locale before touching cookies() or revalidating', async () => {
    const res = await setLocale('klingon');
    expect(res).toEqual({ ok: false });
    expect(cookiesMock).not.toHaveBeenCalled();
    expect(cookiesSetMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it('rejects an empty string locale', async () => {
    const res = await setLocale('');
    expect(res).toEqual({ ok: false });
    expect(cookiesMock).not.toHaveBeenCalled();
  });

  it('a supported locale writes the cookie with the exact expected options', async () => {
    const res = await setLocale('el');
    expect(res).toEqual({ ok: true });
    expect(cookiesSetMock).toHaveBeenCalledWith(LOCALE_COOKIE, 'el', {
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
      sameSite: 'lax',
    });
  });

  it('revalidates the whole layout (not just the current path) after a successful set', async () => {
    await setLocale('fr');
    expect(revalidatePathMock).toHaveBeenCalledWith('/', 'layout');
  });

  it('accepts every locale in the supported list', async () => {
    for (const code of ['en', 'el', 'es', 'fr', 'de', 'it', 'pt', 'nl']) {
      cookiesSetMock.mockClear();
      const res = await setLocale(code);
      expect(res).toEqual({ ok: true });
      expect(cookiesSetMock).toHaveBeenCalledWith(LOCALE_COOKIE, code, expect.any(Object));
    }
  });
});
