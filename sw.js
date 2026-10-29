// Siyanat Housekeeping Management Portal - Progressive Web App Service Worker
const CACHE_NAME = 'siyanat-hk-cache-v2';
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './maskable-icon-192.png',
  './maskable-icon-512.png',
  './apple-touch-icon.png',
  './favicon.png'
];

// Install Event: Pre-cache core app shell
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('PWA: Some static assets skipped pre-caching:', err);
      });
    })
  );
});

// Activate Event: Clean up outdated caches and claim clients immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) {
            return caches.delete(name);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event: Intelligent routing
// - Bypass API / Firebase / Firestore / Google Drive calls completely (Network Only)
// - Network-first for HTML navigation with offline fallback
// - Cache-first with stale-while-revalidate for local icons & app shell
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Bypass cache for non-GET requests or external streaming APIs
  if (req.method !== 'GET') {
    return;
  }

  // Bypass Firebase Auth, Firestore real-time websockets/long-polling, Google Apps Script Drive uploads
  if (
    url.hostname.includes('firestore.googleapis.com') ||
    url.hostname.includes('firebaseio.com') ||
    url.hostname.includes('identitytoolkit') ||
    url.hostname.includes('script.google.com') ||
    url.hostname.includes('firebasestorage') ||
    url.hostname.includes('drive.google.com')
  ) {
    return;
  }

  // Navigation requests: Network-first, fallback to cached index.html
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((networkRes) => {
          if (networkRes && networkRes.status === 200) {
            const resClone = networkRes.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put('./index.html', resClone));
          }
          return networkRes;
        })
        .catch(() => {
          return caches.match('./index.html') || caches.match('./');
        })
    );
    return;
  }

  // Local assets (icons, manifest): Stale-while-revalidate
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then((cachedRes) => {
        const fetchPromise = fetch(req)
          .then((networkRes) => {
            if (networkRes && networkRes.status === 200) {
              const resClone = networkRes.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
            }
            return networkRes;
          })
          .catch(() => cachedRes);
        return cachedRes || fetchPromise;
      })
    );
    return;
  }

  // External CDN assets (Tailwind, FontAwesome, SheetJS, jsPDF): Cache-first with network fallback
  event.respondWith(
    caches.match(req).then((cachedRes) => {
      if (cachedRes) return cachedRes;
      return fetch(req).then((networkRes) => {
        if (networkRes && networkRes.status === 200) {
          const resClone = networkRes.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
        }
        return networkRes;
      }).catch(() => {
        return new Response('', { status: 408, statusText: 'Request timed out' });
      });
    })
  );
});
