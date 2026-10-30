import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Unregister any legacy Service Workers and purge stale precaches so media streams are never intercepted
if (typeof window !== 'undefined') {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker
      .getRegistrations()
      .then((registrations) => {
        for (const registration of registrations) {
          registration.unregister().catch(() => {});
        }
      })
      .catch(() => {});
  }
  if ('caches' in window) {
    caches
      .keys()
      .then((keys) => {
        for (const key of keys) {
          if (!key.includes('onedownload-offline-media')) {
            caches.delete(key).catch(() => {});
          }
        }
      })
      .catch(() => {});
  }
}

createRoot(document.getElementById('root')!).render(<App />);
