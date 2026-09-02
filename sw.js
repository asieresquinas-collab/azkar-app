// ══════════════════════════════════════════════════════════════
//  AZKAR PWA · Service Worker · Offline-first
// ══════════════════════════════════════════════════════════════
const CACHE_NAME = 'azkar-pwa-v567';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './version.json',
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

  // version.json: SIEMPRE red, nunca cache (para auto-update)
  if (url.pathname.endsWith('/version.json')) {
    e.respondWith(fetch(e.request).catch(() => new Response('{}', {
      headers: { 'Content-Type': 'application/json' }
    })));
    return;
  }

  // API calls (Firebase + Railway) + CDN scripts: network only, never cache
  if (url.hostname.includes('firestore') || url.hostname.includes('firebase') || url.hostname.includes('railway.app') || url.hostname.includes('cdnjs.cloudflare.com') || url.hostname.includes('nominatim') || url.hostname.includes('project-osrm') || url.hostname.includes('maps.google')) {
    e.respondWith(fetch(e.request).catch(() => new Response('{"offline":true}', {
      headers: { 'Content-Type': 'application/json' }
    })));
    return;
  }

  // HTML pages: network-first (always get latest, fallback to cache)
  if (e.request.destination === 'document' || e.request.url.endsWith('.html')) {
    e.respondWith(
      fetch(e.request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        }
        return response;
      }).catch(() => caches.match(e.request).then(c => c || caches.match('./index.html')))
    );
    return;
  }

  // Everything else (fonts, icons): cache-first
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


// ══════════════════════════════════════════════════════════════
//  Azkarin Proactivo · Push notifications (v224)
// ══════════════════════════════════════════════════════════════
self.addEventListener('push', function(event) {
  var data = {
    title: 'Azkarin',
    body: 'Tienes una notificación nueva',
    tag: 'azkarin',
    requireInteraction: false,
    icon: './icons/azkarin-128.png',
    badge: './icons/azkarin-64.png',
    data: { url: './?chat=1' }
  };
  try { if (event.data) data = Object.assign(data, event.data.json()); } catch(e) {}

  var _notifData = Object.assign({ url: './?chat=1' }, data.data || {}, { _body: data.body, _title: data.title });
  var _esQuick = data.tag === 'azkarin-quick' || (data.data && data.data._quick);
  var _opts = {
    body: data.body,
    tag: data.tag,
    requireInteraction: !!data.requireInteraction,
    icon: data.icon,
    badge: data.badge,
    data: _notifData,
    actions: data.actions || [{ action: 'open', title: 'Abrir chat' }]
  };
  if (_esQuick) { _opts.silent = true; _opts.renotify = false; }
  else { _opts.vibrate = data.urgente ? [300, 100, 300, 100, 300] : [200, 100, 200]; }
  var _tareas = [self.registration.showNotification(data.title, _opts)];
  if (!_esQuick) {
    _tareas.push(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(cl) {
      cl.forEach(function(c) { try { c.postMessage({ type: 'AZKARIN_SPEAK', title: data.title, body: data.body }); } catch(e) {} });
    }));
  }
  event.waitUntil(Promise.all(_tareas));
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  // v284: si es el botón rápido, reponerlo para que siga siempre en la barra
  if (event.notification.tag === 'azkarin-quick') {
    event.waitUntil(self.registration.showNotification('🎙 Azkarin — toca para hablar', {
      body: 'Manos libres: te escucho nada más abrir',
      tag: 'azkarin-quick', icon: './icons/azkarin-128.png', badge: './icons/azkarin-64.png',
      requireInteraction: true, silent: true,
      data: { url: './?azkarin=voz', _quick: true },
      actions: [{ action: 'open', title: '🎙 Hablar con Azkarin' }]
    }).catch(function(){}));
  }
  var targetUrl = (event.notification.data && event.notification.data.url) || './?chat=1';
  var _sayBody = (event.notification.data && event.notification.data._body) || '';
  // Si la URL es relativa, hacerla absoluta respecto al scope
  if (targetUrl.startsWith('./') || targetUrl.startsWith('/')) {
    targetUrl = self.registration.scope.replace(/\/$/, '') + '/' + targetUrl.replace(/^\.?\//, '');
  }
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      // Si ya hay una ventana abierta de la app, enfocarla y enviarle el URL
      for (var i = 0; i < clientList.length; i++) {
        var c = clientList[i];
        if (c.url.includes('asieresquinas-collab.github.io/azkar-app') || c.url.includes(self.registration.scope)) {
          c.postMessage({ type: 'AZKARIN_NOTIFICATION', url: targetUrl, data: event.notification.data });
          return c.focus();
        }
      }
      // Si no hay ventana abierta, abrir una nueva en la URL
      return clients.openWindow(targetUrl + (targetUrl.indexOf('?') >= 0 ? '&' : '?') + 'say=' + encodeURIComponent(_sayBody));
    })
  );
});
