const CACHE_NAME = 'asta-mart-v1';
const FRAME_URLS = [];

// Generate all frame URLs for caching
for (let i = 1; i <= 39; i++) {
  FRAME_URLS.push(`/frames/frame_${String(i).padStart(4, '0')}.jpg`);
}

const urlsToCache = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/effects.js',
  '/asta_mart_logo_transparent.png',
  '/favicon-32x32.png',
  '/favicon-64x64.png',
  ...FRAME_URLS
];

// Install event: cache app shell and frames
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Caching app shell and video frames...');
        return cache.addAll(urlsToCache).catch(err => {
          console.warn('[SW] Some resources failed to cache:', err);
          // Don't fail install if some resources aren't available
        });
      })
      .then(() => {
        // Skip waiting to activate immediately
        self.skipWaiting();
      })
      .catch(err => {
        console.error('[SW] Cache setup failed:', err);
      })
  );
});

// Activate event: clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      // Claim all clients
      return self.clients.claim();
    })
  );
});

// Fetch event: serve from cache, fall back to network
self.addEventListener('fetch', event => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // Skip API requests (let them go to network)
  if (event.request.url.includes('/api/') || event.request.url.includes('api.asta-mart.in')) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Cache hit: return response
        if (response) {
          return response;
        }
        return fetch(event.request).catch(() => {
          // Network failed: return offline page if available
          return caches.match('/index.html');
        });
      })
      .catch(err => {
        console.warn('[SW] Fetch handler error:', err);
        return new Response('Offline - Service Worker error', {
          status: 503,
          statusText: 'Service Unavailable',
          headers: new Headers({
            'Content-Type': 'text/plain'
          })
        });
      })
  );
});
