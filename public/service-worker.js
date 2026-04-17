const CACHE = 'meal-planner-v2';

// On install: cache just the HTML shell (static assets are content-hashed by the build tool)
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.add('/'))
  );
  self.skipWaiting();
});

// On activate: delete any caches from previous versions
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Never intercept API calls or non-GET requests — always hit the network
  if (request.method !== 'GET' || url.pathname.startsWith('/api/')) {
    return;
  }

  // Static assets (JS/CSS/fonts with content hashes): cache-first, update in background
  if (
    url.pathname.startsWith('/static/') ||
    url.pathname.match(/\.(woff2?|ttf|otf|ico|png|svg|webp|jpg)$/)
  ) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        const networkFetch = fetch(request).then((res) => {
          cache.put(request, res.clone());
          return res;
        });
        return cached || networkFetch;
      })
    );
    return;
  }

  // HTML navigations: network-first, fall back to cached shell for offline use
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/'))
    );
    return;
  }
});
