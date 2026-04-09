// Cache versioning for automatic updates on deployment
const CACHE_VERSION = 'v1.0.0';
const CACHE_NAME = `asta-mart-${CACHE_VERSION}`;

// Essential frames to preload (improve first load performance)
const ESSENTIAL_FRAME_IDS = [1, 10, 20, 39];  // Sample frames covering range
const ESSENTIAL_FRAME_URLS = ESSENTIAL_FRAME_IDS.map(i => 
  `/frames/frame_${String(i).padStart(4, '0')}.jpg`
);

// App shell resources
const urlsToCache = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/effects.js',
  '/vp-store.html',
  '/asta_mart_logo_transparent.png',
  '/favicon-32x32.png',
  '/favicon-64x64.png',
  ...ESSENTIAL_FRAME_URLS  // Only essential frames on install
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

// Fetch event: serve from cache, fallback to network, lazy-load frames
self.addEventListener('fetch', event => {
  // Lazy-load frames on demand (cache-first strategy)
  if (event.request.url.includes('/frames/')) {
    event.respondWith(
      caches.open(CACHE_NAME)
        .then(cache => 
          cache.match(event.request)
            .then(response => {
              if (response) return response;
              // Frame not cached, fetch and cache it
              return fetch(event.request).then(res => {
                if (res.ok) cache.put(event.request, res.clone());
                return res;
              });
            })
        )
        .catch(() => fetch(event.request))
    );
    return;
  }


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
