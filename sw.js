// =========================================
// LIFEOS – SERVICE WORKER v5
// (adds push + notificationclick events)
// =========================================

const CACHE_NAME = 'lifeos-v5';

const APP_SHELL = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/firebase.js',
  '/notifications.js',
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
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  const isLocal = url.origin === self.location.origin;
  if (!isLocal) {
    event.respondWith(fetch(event.request).catch(() => new Response('')));
    return;
  }
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

// ── Push notifications (from server or self.registration.showNotification) ──
self.addEventListener('push', event => {
  let data = { title: 'LifeOS', body: 'You have a new notification.' };
  try { data = event.data.json(); } catch (_) {}
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body:    data.body    || '',
      icon:    data.icon    || '/favicon.svg',
      badge:   '/favicon.svg',
      tag:     data.tag     || 'lifeos',
      renotify: true,
      vibrate: [200, 100, 200],
      data:    { url: data.url || '/' }
    })
  );
});

// ── Tap on notification → open/focus the app ──
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});
