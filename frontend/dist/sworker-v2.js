const CACHE_NAME = 'nka-bulletin-0efd10fe554c';
const APP_SHELL = [
  '/index.html?v=v39',
  '/manifest.json?v=v26',
  '/css/app.css?v=3493ef15',
  '/js/analyse.js?v=3a6534ff',
  '/js/app.js?v=7f4c2dc1',
  '/js/client.js?v=735512b4',
  '/js/dropdown.js?v=53173405',
  '/js/pin.js?v=65c162dc',
  '/js/parcours.js?v=ce1ca92e',
  '/js/guided.js?v=fe76525c',
  '/js/capacitor.js?v=639c0360',
  '/js/admin.js?v=e14672b2',
  '/js/dashboard.js?v=671690d0',
  '/js/accounts.js?v=2b535b4d',
  '/js/bulletins.js?v=d0945732',
  '/js/confirm.js?v=e5e6a2ab',
  '/js/settings.js?v=9b63a163',
  '/js/reset.js?v=9dd712a7',
  '/js/theme.js?v=d8dbba78',
  '/js/version.js?v=10cf7275',
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

// Détecter quand un nouveau SW est en attente (installé mais pas encore actif)
// et notifier les clients pour afficher "Mise à jour disponible"
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'CHECK_UPDATE') {
    // Le client demande s'il y a une mise à jour en attente
    // (pas nécessaire ici car on skipWaiting immédiat, mais utile pour pattern classique)
    event.ports[0]?.postMessage({ updateAvailable: false });
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
    .then(() => {
      // Notifier tous les clients qu'une nouvelle version est active
      return self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    })
    .then((clients) => {
      clients.forEach((client) => {
        client.postMessage({ type: 'nka-sw-updated', cacheName: CACHE_NAME });
      });
    })
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
  // /index.html?v=xxx — on utilise ignoreSearch: true pour matcher.
  // EXCEPTION : les redirections OAuth (/api/auth/google) doivent passer au
  // navigateur pour ouvrir la page de consentement Google.
  if (event.request.mode === 'navigate' && !url.pathname.startsWith('/api/auth/')) {
    event.respondWith(
      caches.match('/index.html', { ignoreSearch: true }).then((cached) => {
        // NETWORK-FIRST : on sert le réseau en priorité pour que toute nouvelle
        // version déployée soit visible immédiatement. Le cache ne sert que de
        // secours en cas d'échec réseau (mode offline).
        const fetchPromise = fetch(event.request).then((response) => {
          if (response.ok) {
            const cloned = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', cloned)).catch(() => {});
          }
          return response;
        }).catch(() => cached);
        return fetchPromise;
      })
    );
    return;
  }

  // API privée (/api/* GET) : jamais de Cache Storage. Les bulletins offline
  // sont gérés explicitement par IndexedDB et peuvent donc être purgés.
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request).catch(() => new Response(JSON.stringify({ error: 'Hors ligne' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        }))
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
    // 1. Essayer de naviguer un client existant (fonctionne sur Android/desktop)
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.navigate(targetUrl).then(() => client.focus());
        }
      }
      // 2. Essayer clients.openWindow (ne fonctionne PAS sur iOS PWA)
      if ('openWindow' in clients) {
        return clients.openWindow(targetUrl);
      }
      // 3. Fallback iOS : stocker l'URL cible et notifier les clients via postMessage
      // Le client principal (app.js) écoutera ce message et naviguera
      return clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
        clients.forEach(client => client.postMessage({ type: 'nka-notification-click', url: targetUrl }));
      });
    })
  );
});

// Écouter les messages du client principal (ex. pour skipWaiting)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Background Sync : relancer la synchronisation quand la connexion revient
// Le client enregistre 'nka-sync' via registration.sync.register() quand il est hors ligne
self.addEventListener('sync', (event) => {
  if (event.tag === 'nka-sync') {
    event.waitUntil(
      // Notifier tous les clients pour qu'ils déclenchent la sync
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
        clientList.forEach(client => client.postMessage({ type: 'nka-background-sync' }));
      })
    );
  }
});

// Periodic Background Sync (si supporté) : sync automatique en arrière-plan
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'nka-periodic-sync') {
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
        clientList.forEach(client => client.postMessage({ type: 'nka-background-sync' }));
      })
    );
  }
});
