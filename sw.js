// ══════════════════════════════════════════════════════════════
//  AZKAR PWA · Service Worker · Offline-first
// ══════════════════════════════════════════════════════════════
const CACHE_NAME = 'azkar-pwa-v6';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon.svg',
  'https://fonts.googleapis.com/css2?family=Barlow:wght@400;600;700;800&family=Barlow+Condensed:wght@700;800&display=swap'
];

// Install: cache core assets
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate: clean old caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch: cache-first for app shell, network-first for API
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Firebase API calls: network only
  if (url.hostname.includes('firestore') || url.hostname.includes('firebase')) {
    e.respondWith(fetch(e.request).catch(() => new Response('{"offline":true}', {
      headers: { 'Content-Type': 'application/json' }
    })));
    return;
  }

  // Everything else: cache-first
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        }
        return response;
      });
    }).catch(() => {
      if (e.request.destination === 'document') {
        return caches.match('./index.html');
      }
    })
  );
});
