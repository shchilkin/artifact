// fallow-ignore-file unused-file
const CACHE_VERSION = 'artifact-v0.33.0-shell';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const APP_SHELL_URLS = ['/', '/app', '/offline.html', '/favicon.svg', '/manifest.webmanifest', '/og.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(APP_SHELL_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key.startsWith('artifact-') && key !== STATIC_CACHE).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  if (!shouldHandleRequest(event.request)) return;
  event.respondWith(responseForRequest(event.request));
});

function shouldHandleRequest(request) {
  if (request.method !== 'GET') return false;
  const url = new URL(request.url);
  return url.origin === self.location.origin && !url.pathname.startsWith('/api/');
}

function responseForRequest(request) {
  if (request.mode === 'navigate') return networkFirstNavigation(request);
  if (shouldRuntimeCache(request)) return staleWhileRevalidate(request);
  return fetch(request);
}

async function cacheSuccessfulResponse(cache, request, response) {
  if (response.ok) await cache.put(request, response.clone());
}

async function networkFirstNavigation(request) {
  const cache = await caches.open(STATIC_CACHE);
  try {
    const response = await fetch(request);
    await cacheSuccessfulResponse(cache, request, response);
    return response;
  } catch {
    return cacheNavigationFallback(cache, request);
  }
}

async function cacheNavigationFallback(cache, request) {
  const fallbackUrls = [request, '/app', '/', '/offline.html'];
  for (const fallbackUrl of fallbackUrls) {
    const response = await cache.match(fallbackUrl);
    if (response) return response;
  }
  return Response.error();
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  const fresh = fetch(request)
    .then((response) => {
      void cacheSuccessfulResponse(cache, request, response);
      return response;
    })
    .catch(() => null);
  return cached ?? (await fresh) ?? Response.error();
}

function shouldRuntimeCache(request) {
  return ['style', 'script', 'worker', 'image', 'font', 'manifest'].includes(request.destination);
}
