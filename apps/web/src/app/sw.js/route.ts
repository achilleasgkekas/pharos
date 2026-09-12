/**
 * Web Push service worker (P102), served as an App Router route rather than a public/
 * file — this standalone deployment serves its manifest and icon the same way (app/
 * manifest.ts, app/icon.svg), and public/ static files are not served here.
 *
 * Minimal on purpose: NOT an offline/caching worker, only the two handlers a push
 * subscription needs — show the notification dispatchWebPush() signed ({ title, body }),
 * and focus/open the app on click. Served with no-cache so an updated worker is picked up.
 */

const SERVICE_WORKER = `
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: 'Pharos', body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'Pharos';
  const body = data.body || '';
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/icon.svg',
      badge: '/icon.svg',
      tag: 'pharos-alert',
      renotify: true,
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })
  );
});
`;

export function GET(): Response {
  return new Response(SERVICE_WORKER, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      // A service worker must not be cached aggressively, or an updated worker never ships.
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      // Allow the worker to control the whole origin even though it's served from /sw.js.
      'Service-Worker-Allowed': '/',
    },
  });
}
