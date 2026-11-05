// Lets the web app open with no signal. API responses are private and never cached.
const CACHE = 'sandbag-shell-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  const key = event.request.mode === 'navigate' ? '/' : event.request;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // Bundles are named by their contents, so a cached one can't be out of date.
    if (url.pathname.startsWith('/_expo/') || url.pathname.startsWith('/assets/')) {
      const hit = await cache.match(event.request);
      if (hit) return hit;
    }
    try {
      const response = await fetch(event.request);
      if (response.ok) await cache.put(key, response.clone());
      return response;
    } catch (error) {
      const hit = await cache.match(key);
      if (hit) return hit;
      throw error;
    }
  })());
});

// Sent by the push worker as { title, body, route }. Safari drops a subscription that gets
// a push without showing something, so this always shows.
self.addEventListener('push', (event) => {
  const message = (() => {
    try {
      return event.data?.json() ?? {};
    } catch {
      return {};
    }
  })();
  event.waitUntil((async () => {
    await self.registration.showNotification(message.title || 'Sandbag', {
      body: message.body || '',
      icon: '/icon-192.png',
      data: { route: message.route ?? null },
    });
    for (const client of await self.clients.matchAll({ type: 'window' })) client.postMessage({ type: 'pushed' });
  })());
});

// Opens where the notification leads. The app knows its routes, so it gets the route, not a URL.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const route = event.notification.data?.route ?? null;
  event.waitUntil((async () => {
    const [open] = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (open) {
      await open.focus();
      if (route) open.postMessage({ type: 'open', route });
      return;
    }
    await self.clients.openWindow(route ? `/?open=${encodeURIComponent(route)}` : '/');
  })());
});
