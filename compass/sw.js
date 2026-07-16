/* Impact Compass service worker — scoped to /compass/. */
const CACHE_NAME = 'impact-compass-v15';
const OFFLINE_ASSETS = [
  './',
  './index.html',
  './app.css',
  './app.js',
  './notify.js',
  './data.js',
  './manifest.webmanifest',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(OFFLINE_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k.startsWith('impact-compass-') && k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

/* Daily-nudge notification tap → open (or focus) that problem. */
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || './';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(wins => {
      for (const w of wins) { if ('focus' in w) { w.focus(); if ('navigate' in w) w.navigate(url); return; } }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});

/* HTML: network-first (fresh app shell, cache fallback keeps it working
   offline). AI worker calls: never cached. Other assets: cache-first. */
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.hostname.endsWith('.workers.dev')) return;

  const isHTML = event.request.headers.get('accept')?.includes('text/html');
  if (isHTML && url.origin === self.location.origin) {
    event.respondWith(
      fetch(event.request)
        .then(res => {
          // only cache good responses — a transient 404/500 must never
          // overwrite the known-good offline app shell
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          }
          return res;
        })
        .catch(() => caches.match(event.request).then(cached => cached || caches.match('./index.html')))
    );
  } else {
    // Stale-while-revalidate: serve from cache instantly, refresh in the
    // background — so app.js/data.js deploys reach returning users even
    // when CACHE_NAME wasn't bumped.
    event.respondWith(
      caches.match(event.request).then(cached => {
        const refresh = fetch(event.request).then(res => {
          if (res && res.status === 200 && res.type !== 'opaque') {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          }
          return res;
        }).catch(() => cached);
        return cached || refresh;
      })
    );
  }
});
