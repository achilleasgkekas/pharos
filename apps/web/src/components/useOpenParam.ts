'use client';
import { useEffect, useRef } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';

/**
 * Deep-link helper: when the URL has `?open=<id>` (set by global search), call
 * `onOpen(id)` once so the page can open the matching detail, then strip the
 * param so closing the detail doesn't re-open it.
 */
export function useOpenParam(onOpen: (id: string) => void): void {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const cb = useRef(onOpen);
  useEffect(() => {
    cb.current = onOpen;
  }, [onOpen]);
  const openId = params.get('open');

  useEffect(() => {
    if (!openId) return;
    cb.current(openId);
    router.replace(pathname, { scroll: false });
  }, [openId, router, pathname]);
}
