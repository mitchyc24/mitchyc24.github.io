// MiNotes service worker — caches the app shell so the app runs fully offline.
// Notes themselves never pass through here; they live on the local file system.

const CACHE_NAME = 'minotes-shell-v2';

const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/app.js',
  './js/autocomplete.js',
  './js/db.js',
  './js/fs.js',
  './js/markdown.js',
  './js/search.js',
  './vendor/marked.esm.js',
  './vendor/purify.es.mjs',
  './vendor/minisearch.js',
  './icons/favicon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)),
      ))
      .then(() => self.clients.claim()),
  );
});

// Cache-first for the shell (it's versioned by CACHE_NAME), falling back to
// the network for anything else. Navigations fall back to the cached index
// so the app opens with no connection at all.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then((cached) => {
      if (cached) return cached;
      return fetch(request).catch(() => {
        if (request.mode === 'navigate') return caches.match('./index.html');
        return Response.error();
      });
    }),
  );
});
