// =========================================
// LIFEOS – SERVICE WORKER
// sw.js
// Enables offline mode by caching all pages
// =========================================

const CACHE_NAME = 'lifeos-v2';

// All files to cache on install
const FILES_TO_CACHE = [
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

// ----- Install: cache all core files -----
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[SW] Caching app shell');
      return cache.addAll(FILES_TO_CACHE);
    })
  );
  // Activate immediately without waiting
  self.skipWaiting();
});

// ----- Activate: clean up old caches -----
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => {
            console.log('[SW] Removing old cache:', key);
            return caches.delete(key);
          })
      )
    )
  );
  // Take control of all open pages immediately
  self.clients.claim();
});

// ----- Fetch: serve from cache, fall back to network -----
self.addEventListener('fetch', event => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      // Return cached version if available
      if (cachedResponse) {
        return cachedResponse;
      }

      // Otherwise fetch from network and cache it
      return fetch(event.request).then(networkResponse => {
        // Don't cache external requests (e.g. Google Fonts)
        if (!event.request.url.startsWith(self.location.origin)) {
          return networkResponse;
        }

        return caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, networkResponse.clone());
          return networkResponse;
        });
      }).catch(() => {
        // If both cache and network fail, show 404 page
        return caches.match('/404.html');
      });
    })
  );
});
