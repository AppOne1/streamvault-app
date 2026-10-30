// Self-cleaning Service Worker to ensure fresh network streams and prevent stale cached bundles
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys();
        for (const key of keys) {
          if (!key.includes('onedownload-offline-media')) {
            await caches.delete(key);
          }
        }
        await self.registration.unregister();
        const clients = await self.clients.matchAll({ type: 'window' });
        for (const client of clients) {
          client.navigate(client.url);
        }
      } catch {
        // ignore
      }
    })()
  );
});
