'use client';

import { useEffect } from 'react';

/**
 * Makes the FAQ accordion deep-linkable and shareable. Pure progressive
 * enhancement over the server-rendered <details id="faq-..."> items:
 *
 *  - On load (and on hashchange), if the URL hash matches a FAQ item, it opens
 *    that <details> and scrolls it into view. So /#faq-how-do-backups-work lands
 *    the reader straight on that answer, expanded.
 *  - When a reader opens a question, the URL hash is updated (via replaceState,
 *    so it never floods the back button) to that item's id. Copying the address
 *    then shares that exact answer.
 *
 * No-ops during SSR and if the FAQ section is absent. Honours
 * prefers-reduced-motion (instant scroll instead of smooth).
 */
export function FaqDeepLink() {
  useEffect(() => {
    // Scoped to the FAQ section, which holds one .faq-list per topic group,
    // so an item in any group stays reachable by hash.
    const section = document.getElementById('faq');
    if (!section) return;

    const items = Array.from(
      section.querySelectorAll<HTMLDetailsElement>('details[id^="faq-"]'),
    );
    if (items.length === 0) return;

    const openFromHash = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (!id) return;
      const target = items.find((el) => el.id === id);
      if (!target) return;
      target.open = true;
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      target.scrollIntoView({
        behavior: reduce ? 'auto' : 'smooth',
        block: 'center',
      });
    };

    // Reflect the opened question in the URL so it can be copied and shared,
    // without pushing a new history entry on every toggle.
    const onToggle = (event: Event) => {
      const el = event.currentTarget as HTMLDetailsElement;
      if (!el.open) return;
      if (window.location.hash.slice(1) !== el.id) {
        window.history.replaceState(null, '', `#${el.id}`);
      }
    };

    items.forEach((el) => el.addEventListener('toggle', onToggle));
    window.addEventListener('hashchange', openFromHash);
    openFromHash();

    return () => {
      items.forEach((el) => el.removeEventListener('toggle', onToggle));
      window.removeEventListener('hashchange', openFromHash);
    };
  }, []);

  return null;
}
