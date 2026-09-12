/* Pharos Web Push service worker (P102).
 *
 * Minimal on purpose — this is NOT an offline/caching worker, only the two handlers a
 * push subscription needs: show the notification the server sent, and focus/open the app
 * when it's clicked. The payload is the JSON dispatchWebPush() signs: { title, body }.
 */

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    // A push with no / non-JSON body still deserves a generic notification.
    data = { title: 'Pharos', body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'Pharos';
  const body = data.body || '';
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/icon.svg',
      badge: '/icon.svg',
      tag: 'pharos-alert', // collapse rapid alerts into one instead of stacking
      renotify: true,
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Focus an already-open Pharos tab if there is one, otherwise open a new one.
      for (const client of clients) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })
  );
});
