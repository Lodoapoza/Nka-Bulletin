const CACHE_NAME = 'nka-bulletin-v14';
const APP_SHELL = [
  '/index.html?v=v23',
  '/manifest.json?v=v23',
  '/css/app.css?v=v23',
  '/js/app.js?v=v23',
  '/js/client.js?v=v23',
  '/js/pin.js?v=v23',
  '/js/capacitor.js?v=v23',
  '/js/dashboard.js?v=v23',
  '/js/accounts.js?v=v23',
  '/js/bulletins.js?v=v23',
  '/js/settings.js?v=v23',
  '/js/theme.js?v=v23',
  '/js/version.js?v=v23',
  '/icons/logo.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.allSettled(
        APP_SHELL.map(url =>
          cache.add(url).catch(() => {})
        )
      )
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  // Téléchargements PDF et requêtes non-GET : jamais interceptés.
  // Hors ligne, ils échoueront réellement (le client gère le fallback IndexedDB).
  if (url.pathname.includes('/download') || event.request.method !== 'GET') {
    return;
  }
  if (url.search.includes('sw-no-cache')) {
    event.respondWith(fetch(event.request));
    return;
  }
  // Stratégie NETWORK-FIRST : données toujours fraîches quand le réseau est là.
  // Le cache ne sert qu'en échec réseau, marqué X-Cache: hit.
  event.respondWith(
    fetch(event.request).then((response) => {
      if (response.ok) {
        const cloned = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cloned)).catch(() => {});
      }
      return response;
    }).catch(async () => {
      const cached = await caches.match(event.request);
      if (cached) {
        const headers = new Headers(cached.headers);
        headers.set('X-Cache', 'hit');
        return new Response(cached.body, { status: cached.status, statusText: cached.statusText, headers });
      }
      return new Response(JSON.stringify({ error: 'Hors ligne' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
    })
  );
});

self.addEventListener('push', (event) => {
  let data = { title: 'Nka Bulletin', body: 'Nouvel événement.' };
  try { data = event.data.json(); } catch (_) {}
  event.waitUntil(
    self.registration.showNotification(data.title || 'Nka Bulletin', {
      body: data.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      vibrate: [100, 50, 100],
      data: { url: '/index.html#bulletins' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/index.html';
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      return clients.openWindow(targetUrl);
    })
  );
});
