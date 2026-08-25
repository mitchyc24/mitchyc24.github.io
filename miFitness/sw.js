const CACHE_NAME = 'mifitness-v3';

const APP_SHELL = [
    './',
    './index.html',
    './css/styles.css',
    './js/app.js',
    './js/db.js',
    './js/stats.js',
    './js/charts.js',
    './js/ui.js',
    './js/i18n.js',
    './vendor/sql-wasm.js',
    './vendor/sql-wasm.wasm',
    './manifest.webmanifest',
    './icons/favicon.svg',
    './icons/icon-192x192.png',
    './icons/icon-512x512.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(APP_SHELL))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(
                keys.filter((key) => key.startsWith('mifitness-') && key !== CACHE_NAME)
                    .map((key) => caches.delete(key))
            ))
            .then(() => self.clients.claim())
    );
});

// Network-first for navigations so a deploy shows up, cache-first for the
// rest — the sql.js wasm binary in particular should never be re-fetched.
self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET') return;

    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .then((response) => {
                    const copy = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
                    return response;
                })
                .catch(() => caches.match(request).then((hit) => hit || caches.match('./index.html')))
        );
        return;
    }

    event.respondWith(
        caches.match(request).then((hit) => hit || fetch(request).then((response) => {
            if (response.ok && new URL(request.url).origin === self.location.origin) {
                const copy = response.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
            }
            return response;
        }))
    );
});
