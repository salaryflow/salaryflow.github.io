// Salary Flow service worker: installable app + offline fallback.
// Pages and data are network-first so deploys and data updates show up immediately;
// static assets (icons, duck art) are cache-first. Cross-origin requests (exchange
// rates, GitHub API, ads) are never intercepted.
const VERSION = 'sf-v1';
const SHELL = ['./', './index.html', './privacy.html', './manifest.webmanifest',
  './assets/icons/icon-192.png', './assets/icons/icon-512.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(VERSION).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(key => key !== VERSION).map(key => caches.delete(key))))
    .then(() => self.clients.claim()));
});

async function networkFirst(request) {
  const cache = await caches.open(VERSION);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request, {ignoreSearch: true});
    if (cached) return cached;
    if (request.mode === 'navigate') return (await cache.match('./index.html')) || Response.error();
    throw error;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(VERSION);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

self.addEventListener('fetch', event => {
  const {request} = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const scope = new URL(self.registration.scope);
  if (!url.pathname.startsWith(scope.pathname)) return;
  if (request.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname.includes('/data/')) {
    event.respondWith(networkFirst(request));
  } else if (url.pathname.includes('/assets/') || url.pathname.endsWith('.webmanifest')) {
    event.respondWith(cacheFirst(request));
  }
});
