/* FocusFlow offline shell.
   The API is never cached — the app keeps its own local copy of room state and
   queues writes, so stale HTML/JS must not mask a fresh deploy. */

const SHELL = 'focusflow-shell-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== SHELL).map((key) => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return; // always live

  // Navigations: network first so a deploy is picked up, cache as fallback.
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request);
          const cache = await caches.open(SHELL);
          cache.put('/index.html', fresh.clone());
          return fresh;
        } catch {
          const cache = await caches.open(SHELL);
          return (await cache.match('/index.html')) ?? Response.error();
        }
      })(),
    );
    return;
  }

  // Hashed assets: cache first, then refresh in the background.
  event.respondWith(
    (async () => {
      const cache = await caches.open(SHELL);
      const cached = await cache.match(request);
      if (cached) {
        fetch(request)
          .then((response) => {
            if (response.ok) cache.put(request, response.clone());
          })
          .catch(() => undefined);
        return cached;
      }
      const response = await fetch(request);
      if (response.ok && (url.pathname.startsWith('/assets/') || url.pathname === '/icon.svg')) {
        cache.put(request, response.clone());
      }
      return response;
    })(),
  );
});
