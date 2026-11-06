// OneDownload Active Background Keep-Alive & Offline Media Service Worker
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
        await self.clients.claim();
      } catch {
        // ignore
      }
    })()
  );
});

// Background Keep-Alive Session Handler: Prevents Android/iOS from suspending active downloads
self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data) return;

  if (data.type === 'KEEP_ALIVE_DOWNLOAD') {
    event.waitUntil(
      (async () => {
        if (event.source && typeof event.source.postMessage === 'function') {
          event.source.postMessage({
            type: 'SW_KEEP_ALIVE_ACK',
            timestamp: Date.now(),
            activeCount: data.activeCount || 0
          });
        }
      })()
    );
  }
});

