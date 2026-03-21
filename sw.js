const STATIC_CACHE = 'duesily-static-v5';
const DATA_CACHE = 'duesily-data-v1';
const APP_SHELL = [
  './',
  './index.html',
  './config.js',
  './app.js',
  './styles.css',
  './manifest.webmanifest',
  './icons/Fav Icon.png',
  './icons/In-app Logo.png'
];

function isApiRequest(url) {
  return (
    url.pathname.includes('/rest/v1/') ||
    url.pathname.includes('/functions/v1/') ||
    url.pathname.includes('/_functions/') ||
    url.pathname.includes('/api/')
  );
}

function isStaticAssetRequest(request, url) {
  return (
    request.mode === 'navigate' ||
    request.destination === 'style' ||
    request.destination === 'script' ||
    request.destination === 'image' ||
    request.destination === 'font' ||
    request.destination === 'manifest' ||
    APP_SHELL.some(asset => url.pathname.endsWith(asset.replace(/^\.\//, '')))
  );
}

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => ![STATIC_CACHE, DATA_CACHE].includes(key))
          .map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response && response.ok) {
    const cache = await caches.open(STATIC_CACHE);
    cache.put(request, response.clone());
  }
  return response;
}

async function networkFirst(request) {
  const cache = await caches.open(DATA_CACHE);
  try {
    const response = await fetch(request, { cache: 'no-store' });
    if (response && response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw error;
  }
}

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  if (isApiRequest(url)) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  if (url.origin === self.location.origin && isStaticAssetRequest(event.request, url)) {
    if (event.request.mode === 'navigate') {
      event.respondWith(
        fetch(event.request, { cache: 'no-store' })
          .then(response => {
            if (response && response.ok) {
              caches.open(STATIC_CACHE).then(cache => cache.put('./index.html', response.clone()));
            }
            return response;
          })
          .catch(async () => {
            const cached = await caches.match(event.request);
            return cached || caches.match('./index.html');
          })
      );
      return;
    }

    event.respondWith(cacheFirst(event.request));
  }
});
