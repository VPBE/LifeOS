// =========================================
// LIFEOS – SERVICE WORKER v4
// =========================================

const CACHE_NAME = 'lifeos-v4';

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
  '/modules/ai.html',
  '/404.html'
];

self.addEventListener('install', event => {
  // Force this SW to become active immediately, skipping the waiting phase
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    // Nuke every cache that isn't the current one
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim()) // take control of all tabs immediately
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  const isLocal = url.origin === self.location.origin;

  // Let external requests (Firebase, Google Fonts CDN) go straight to network
  if (!isLocal) {
    event.respondWith(fetch(event.request).catch(() => new Response('')));
    return;
  }

  // Network-first for all local files (HTML / JS / CSS always fresh)
  event.respondWith(
    fetch(event.request)
      .then(res => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
        return res;
      })
      .catch(() =>
        caches.match(event.request)
          .then(cached => cached || caches.match('/404.html'))
      )
  );
});
