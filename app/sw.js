const CACHE = 'nka-bulletin-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/css/variables.css',
  '/css/base.css',
  '/css/components.css',
  '/js/app.js',
  '/js/api.js',
  '/js/utils.js',
  '/assets/icons/icon.png',
  '/pages/dashboard.html',
  '/pages/explorer.html',
  '/pages/settings.html',
  '/pages/auth.html',
  '/pages/unlock.html'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(ASSETS))
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.url.includes('/api/')) return;
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
