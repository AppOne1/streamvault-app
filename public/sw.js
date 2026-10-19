// Minimal service worker for PWA installability and offline support
const CACHE_NAME = 'oneexpress-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Let browser fetch normally, or fallback for core shell
  if (event.request.method !== 'GET') return;
  // Bypass external video blobs / large proxy streams to avoid memory exhaustion
  if (event.request.url.includes('/api/media/') || event.request.url.includes('blob:')) {
    return;
  }
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
