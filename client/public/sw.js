// Minimal service worker: caches the app shell + articles you opened so they can be read offline.
const CACHE = 'contenthub-v1';
self.addEventListener('install', (e) => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/']))); });
self.addEventListener('activate', (e) => e.waitUntil(clients.claim()));
self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.pathname.startsWith('/socket.io')) return;
  const cacheable = url.pathname.startsWith('/api/posts') || url.pathname.startsWith('/api/categories') || req.mode === 'navigate' || /\.(js|css|png|jpg|svg|webp)$/.test(url.pathname);
  if (!cacheable) return;
  e.respondWith(
    fetch(req).then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); return res; })
      .catch(() => caches.match(req).then((hit) => hit || caches.match('/')))
  );
});
// Push notifications arrive here once you connect a push service (Web Push / FCM)
self.addEventListener('push', (e) => {
  const d = e.data?.json() || { title: 'ContentHub', body: 'You have a new notification' };
  e.waitUntil(self.registration.showNotification(d.title, { body: d.body }));
});
