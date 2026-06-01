// =========================================
// LIFEOS – SERVICE WORKER
// sw.js
// Network-first for HTML/JS/CSS (always fresh)
// Cache-first for fonts/images (stable assets)
// =========================================

const CACHE_NAME = 'lifeos-v3';

const APP_SHELL = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/firebase.js',
  '/manifest.json',
  '/modules/school.html',
  '/modules/productivity.html',
  '/modules/notes.html',
  '/modules/finance.html',
  '/modules/creator.html',
  '/404.html'
];

// ----- Install: pre-cache app shell -----
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[SW] Pre-caching app shell');
      return cache.addAll(APP_SHELL);
    })
  );
  self.skipWaiting();
});

// ----- Activate: delete ALL old caches -----
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => {
            console.log('[SW] Deleting old cache:', key);
            return caches.delete(key);
          })
      )
    )
  );
  self.clients.claim();
});

// ----- Fetch strategy -----
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  const isLocal = url.origin === self.location.origin;
  const isHTML  = event.request.destination === 'document' ||
                  url.pathname.endsWith('.html') ||
                  url.pathname === '/';
  const isAsset = event.request.destination === 'font' ||
                  event.request.destination === 'image';

  // External requests (Firebase SDK, Google Fonts): network only, no caching
  if (!isLocal) {
    event.respondWith(fetch(event.request).catch(() => new Response('')));
    return;
  }

  // HTML, JS, CSS — Network first, fall back to cache
  // This means you always get the latest code; cache is only used offline
  if (isHTML || url.pathname.endsWith('.js') || url.pathname.endsWith('.css')) {
    event.respondWith(
      fetch(event.request)
        .then(networkResponse => {
          // Update the cache with the fresh version
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return networkResponse;
        })
        .catch(() => {
          // Offline: serve from cache
          return caches.match(event.request).then(cached => {
            return cached || caches.match('/404.html');
          });
        })
    );
    return;
  }

  // Fonts, images — Cache first (they don't change)
  if (isAsset) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        return cached || fetch(event.request).then(networkResponse => {
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, networkResponse.clone()));
          return networkResponse;
        });
      })
    );
    return;
  }

  // Everything else — Network first
  event.respondWith(
    fetch(event.request)
      .then(networkResponse => {
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, networkResponse.clone()));
        return networkResponse;
      })
      .catch(() => caches.match(event.request).then(cached => cached || caches.match('/404.html')))
  );
});
