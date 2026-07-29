const CACHE_NAME = 'nka-bulletin-v9';
const APP_SHELL = [
  '/index.html?v=v9',
  '/manifest.json?v=v9',
  '/css/styles.css?v=v9',
  '/js/app.js?v=v9',
  '/js/api.js?v=v9',
  '/js/pin.js?v=v9',
  '/js/capacitor.js?v=v9',
  '/js/dashboard.js?v=v9',
  '/js/accounts.js?v=v9',
  '/js/bulletins.js?v=v9',
  '/js/settings.js?v=v9',
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
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request).catch(() =>
        new Response(JSON.stringify({ error: 'Hors ligne' }), { headers: { 'Content-Type': 'application/json' } })
      )
    );
    return;
  }
  if (url.search.includes('sw-no-cache')) {
    event.respondWith(fetch(event.request));
    return;
  }
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request).then((response) => {
        if (response.ok) {
          const cloned = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cloned));
        }
        return response;
      }).catch(() => cached);
      return cached || fetchPromise;
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
