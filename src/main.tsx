import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Register active Background Keep-Alive Service Worker (/sw.js) and purge only stale bundle caches
if (typeof window !== 'undefined') {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    });
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
