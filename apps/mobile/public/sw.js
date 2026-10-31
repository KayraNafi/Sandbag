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
