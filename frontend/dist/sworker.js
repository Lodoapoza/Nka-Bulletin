const CACHE_NAME = 'nka-bulletin-v26';
const APP_SHELL = [
  '/index.html?v=v29',
  '/manifest.json?v=v25',
  '/css/app.css?v=8e97b51e',
  '/js/analyse.js?v=6a6ad8c5',
  '/js/app.js?v=ff7fb118',
  '/js/client.js?v=e617bc01',
  '/js/dropdown.js?v=53173405',
  '/js/pin.js?v=d27b23d6',
  '/js/parcours.js?v=ce1ca92e',
  '/js/guided.js?v=fe76525c',
  '/js/capacitor.js?v=639c0360',
  '/js/admin.js?v=e14672b2',
  '/js/dashboard.js?v=7d1e957f',
  '/js/accounts.js?v=efa849b1',
  '/js/bulletins.js?v=058adb2b',
  '/js/confirm.js?v=e5e6a2ab',
  '/js/settings.js?v=891b22ba',
  '/js/reset.js?v=74629b98',
  '/js/theme.js?v=d8dbba78',
  '/js/version.js?v=c085f537',
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

  // Navigation (ouverture de la PWA) : servir /index.html depuis le cache
  // immédiatement (cache-first), revalidation en arrière-plan. La navigation
  // demande /index.html SANS query string, alors que le précache stocke
  // /index.html?v=v28 — on matche donc explicitement /index.html.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      caches.match('/index.html').then((cached) => {
        const fetchPromise = fetch(event.request).then((response) => {
          if (response.ok) {
            const cloned = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', cloned)).catch(() => {});
          }
          return response;
        }).catch(() => cached);
        return cached || fetchPromise;
      })
    );
    return;
  }

  // API (/api/* GET) : NETWORK-FIRST — données toujours fraîches en ligne,
  // cache servi uniquement en échec réseau (marqué X-Cache: hit).
  if (url.pathname.startsWith('/api/')) {
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
          return new Response(cached.body, {
            status: cached.status,
            statusText: cached.statusText,
            headers,
          });
        }
        return new Response(JSON.stringify({ error: 'Hors ligne' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        });
      })
    );
    return;
  }

  // Assets statiques (APP_SHELL) : CACHE-FIRST avec revalidation en arrière-plan
  // (stale-while-revalidate) — la coquille s'affiche instantanément hors-ligne.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        fetch(event.request)
          .then((response) => {
            if (response.ok) {
              const cloned = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cloned)).catch(() => {});
            }
          })
          .catch(() => {});
        return cached;
      }
      return fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const cloned = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cloned)).catch(() => {});
          }
          return response;
        })
        .catch(() =>
          new Response(JSON.stringify({ error: 'Hors ligne' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' },
          })
        );
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
